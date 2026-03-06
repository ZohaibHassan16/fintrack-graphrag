import torch
from transformers import AutoModelForCausalLM, AutoTokenizer
from huggingface_hub import snapshot_download
import huggingface_hub.utils
from typing import List, Tuple, Dict, Any
import json
import ast
import logging
import sys
import re
import traceback
import faulthandler
from tqdm import tqdm
from domain.fibo_ontology import ExtractionTriple
from pydantic import ValidationError


faulthandler.enable(file=sys.stderr, all_threads=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
    force=True
)
logger = logging.getLogger(__name__)


class DockerTqdm(tqdm):
    """Forces tqdm to output clean, flushable lines every 3s."""
    def __init__(self, *args, **kwargs):
        kwargs.setdefault("mininterval", 3.0) 
        kwargs.setdefault("file", sys.stdout)
        kwargs.setdefault("dynamic_ncols", False)
        kwargs.setdefault("bar_format", "{l_bar}{bar}| {n_fmt}/{total_fmt} [{elapsed}<{remaining}, {rate_fmt}{postfix}]")
        super().__init__(*args, **kwargs)

    def display(self, msg=None, pos=None):
        if msg is None:
            msg = self.__str__()
        print(msg, file=self.fp, flush=True)


huggingface_hub.utils.tqdm = DockerTqdm


class PyTorchFiboExtractor:
    def __init__(self):
        """Initializes domain-adapted SLMs."""
        self.device = self._detect_device()
        self.model_id = (
            "Qwen/Qwen2.5-7B-Instruct"
            if self.device in ["cuda", "mps"]
            else "Qwen/Qwen2.5-1.5B-Instruct"
        )
        logger.info(f"Hardware detected: {self.device.upper()}. Target model: {self.model_id}")
        sys.stdout.flush()
        
        self.model, self.tokenizer = self._load_model_and_tokenizer()
        logger.info(f"☺☺☺☺ Extractor ready: {self.model_id} on {self.device.upper()}")
        sys.stdout.flush()

    def _detect_device(self) -> str:
        if torch.cuda.is_available(): return "cuda"
        elif hasattr(torch.backends, "mps") and torch.backends.mps.is_available(): return "mps"
        return "cpu"

    def _load_model_and_tokenizer(self):
        logger.info(f"⇧⇧⇧⇧ Starting safe load sequence for {self.model_id} (~3GB)")
        sys.stdout.flush()

        try:
    
            logger.info("↓↓↓↓ Downloading model files...")
            snapshot_download(
                repo_id=self.model_id,
                allow_patterns=["*.safetensors", "*.json", "*.model"], 
                tqdm_class=DockerTqdm,
                etag_timeout=30,
                resume_download=True
            )
            logger.info("⍻⍻⍻⍻ Download completed successfully!")
            sys.stdout.flush()

    
            logger.info("▌▌▌▌ Loading model into RAM...")
            if self.device == "cpu":
                torch_dtype = torch.bfloat16 
                model = AutoModelForCausalLM.from_pretrained(
                    self.model_id,
                    torch_dtype=torch_dtype,
                    low_cpu_mem_usage=True,
                ).to(self.device)
            else:
                model = AutoModelForCausalLM.from_pretrained(
                    self.model_id,
                    torch_dtype="auto",
                    device_map="auto",
                    low_cpu_mem_usage=True,
                )

            tokenizer = AutoTokenizer.from_pretrained(self.model_id)
            if tokenizer.pad_token_id is None:
                tokenizer.pad_token_id = tokenizer.eos_token_id
            
            logger.info("⸗⸗⸗⸗ Model successfully mapped into memory!")
            sys.stdout.flush()
            return model, tokenizer

        except Exception as e:
            logger.error("💥 Model load sequence failed!")
            logger.error(traceback.format_exc())
            sys.stdout.flush()
            sys.stderr.flush()
            raise 

    def extract_triples_with_confidence(self, text_chunk: str) -> Tuple[List[ExtractionTriple], List[float]]:
        system_prompt = (
            "You are a precise financial analyst extracting business relationships "
            "from SEC 10-K MD&A text. Output **ONLY** a valid JSON array. "
            "No explanations, no markdown, no trailing commas."
        )
        user_prompt = (
            f"Text chunk:\n{text_chunk}\n\n"
            "Extract relationships strictly as this JSON array:\n"
            '[\n'
            '  {\n'
            '    "subject_cik": "string (CIK)",\n'
            '    "object_cik": "string (CIK)",\n'
            '    "predicate": "MUST BE EXACTLY ONE OF: SUPPLIES, COMPETES_WITH, OWNS, HAS_RISK_EXPOSURE"\n'
            '  }\n'
            ']\n\n'
            "If no relationship matching those 4 exact predicates exists, return an empty array []."
        )

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]

        text = self.tokenizer.apply_chat_template(
            messages, tokenize=False, add_generation_prompt=True
        )

        inputs = self.tokenizer(text, return_tensors="pt").to(self.device)

        try:
            with torch.no_grad():
                outputs = self.model.generate(
                    **inputs,
                    max_new_tokens=512,
                    temperature=0.0,
                    top_p=0.95,
                    do_sample=False,
                    pad_token_id=self.tokenizer.pad_token_id,
                    eos_token_id=self.tokenizer.eos_token_id,
                    return_dict_in_generate=True,
                    output_scores=True            
                )

            generated_sequence = outputs.sequences[0][inputs.input_ids.shape[1] :]
            generated = self.tokenizer.decode(generated_sequence, skip_special_tokens=True).strip()

            transition_scores = self.model.compute_transition_scores(
                outputs.sequences, outputs.scores, normalize_logits=True
            )
            avg_log_prob = transition_scores[0].mean().item()
            confidence_score = torch.exp(torch.tensor(avg_log_prob)).item()

            if generated.startswith("```json"):
                generated = generated.split("```json")[1].split("```")[0].strip()
            elif generated.startswith("```"):
                generated = generated.split("```")[1].strip()

            match = re.search(r'\[.*\]', generated, re.DOTALL)
            clean_string = match.group(0) if match else generated
            clean_string = clean_string.replace("'", '"')
            clean_string = re.sub(r',\s*]', ']', clean_string) 

            raw_extractions = ast.literal_eval(clean_string)
            validated_triples = []
            confidence_scores_list = []

            if isinstance(raw_extractions, list):
                for raw in raw_extractions:
                    if not isinstance(raw, dict): continue
                    try:
                        validated_triple = ExtractionTriple(**raw)
                        validated_triples.append(validated_triple)
                        confidence_scores_list.append(confidence_score)
                    except ValidationError as e:
                        logger.warning(f"Validation Error intercepted: {e}")

            return validated_triples, confidence_scores_list

        except Exception as e:
            logger.error(f"Inference error: {e}")
            return [], []