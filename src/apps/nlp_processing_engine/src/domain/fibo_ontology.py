from pydantic import BaseModel, Field, field_validator
from typing import List, Literal, Optional

# Core entity node

class CompanyNode(BaseModel):
    """Central anchor point for market intelligence."""
    cik_id: str = Field(..., description="Central Index Key")
    legal_name: str
    stock_ticker: Optional[str] = None
    fibo_sector_classification: str
    
class MarketRiskNode(BaseModel):
    """Represents macroeconomic or specific operational risks."""
    risk_type : Literal[
        "Tariff Increases",
        "Semiconductor Shortages",
        "Regulatory Action",
        "Supply Chain Disruption"
    ]
    description: str

class ExtractionTriple(BaseModel):
    """ Structured triples consisting of a Subject, a Predicate, and an Object.
        This validates LLM output to prevent hallucinated relationships.
    """
    
    subject_cik: str 
    object_cik: str
    
    # Restricting predicates to formally recognized ObjectProperties
    predicate: Literal[
        "SUPPLIES",
        "COMPETES_WITH",
        "OWNS",
        "HAS_RISK_EXPOSURE"
    ]
    
    @field_validator("predicate")
    @classmethod
    def validate_predicate(cls, v: str) -> str:
        allowed = ["SUPPLIES", "COMPETES_WITH", "OWNS", "HAS_RISK_EXPOSURE"]
        if v not in allowed:
            raise ValueError(f"Predicate '{v}' is not a formally recognized ObjectProperty")
        return v
    