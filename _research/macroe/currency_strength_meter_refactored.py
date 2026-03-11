"""
Currency Strength Meter - Refactored Version
Analyzes macro economic data to rank global currency strength.
"""
import os
import logging
from pathlib import Path
from typing import Dict, List, Optional, TypedDict
from dataclasses import dataclass

import pandas as pd
from rich.console import Console
from rich.table import Table

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger(__name__)


class CurrencyScore(TypedDict):
    """Structure for currency score data"""
    Currency: str
    Total_Score: int
    Avg_Score: float
    Indicators: int


@dataclass
class CurrencyConfig:
    """Configuration for currency data files"""
    code: str
    filename: str
    
    
class CurrencyStrengthMeter:
    """Analyzes and displays currency strength based on macro indicators"""
    
    DEFAULT_CURRENCIES: Dict[str, str] = {
        "USD": "us_economic_data.csv",
        "EUR": "eu_file.csv",
        "JPY": "japan_file.csv",
        "CAD": "ca_file.csv",
        "AUD": "au_file.csv",
        "NZD": "nz_file.csv",
        "CNY": "cn_file.csv",
        "CHF": "ch_file.csv"
    }
    
    def __init__(self, data_dir: Optional[Path] = None, console: Optional[Console] = None):
        """
        Initialize the currency strength meter.
        
        Args:
            data_dir: Directory containing CSV files (defaults to script directory)
            console: Rich console for output (creates new if None)
        """
        self.data_dir = data_dir or Path(__file__).parent
        self.console = console or Console()
        self._validate_data_dir()
    
    def _validate_data_dir(self) -> None:
        """Validate that data directory exists"""
        if not self.data_dir.exists():
            raise ValueError(f"Data directory does not exist: {self.data_dir}")
    
    def _load_currency_data(self, currency: str, filename: str) -> Optional[CurrencyScore]:
        """
        Load and calculate scores for a single currency.
        
        Args:
            currency: Currency code (e.g., 'USD')
            filename: CSV filename
            
        Returns:
            CurrencyScore dict or None if file missing/invalid
        """
        file_path = self.data_dir / filename
        
        if not file_path.exists():
            logger.debug(f"Skipping {currency}: file not found at {file_path}")
            return None
        
        try:
            df = pd.read_csv(file_path)
            score_col = f"{currency}_Score"
            
            if score_col not in df.columns:
                logger.warning(f"Column '{score_col}' not found in {filename}")
                return None
            
            # Calculate aggregate metrics
            total_score = df[score_col].sum()
            count = len(df)
            avg_score = total_score / count if count > 0 else 0.0
            
            return CurrencyScore(
                Currency=currency,
                Total_Score=int(total_score),
                Avg_Score=round(float(avg_score), 2),
                Indicators=count
            )
            
        except pd.errors.EmptyDataError:
            logger.error(f"File {filename} is empty")
            return None
        except Exception as e:
            logger.error(f"Error reading {filename}: {e}", exc_info=True)
            return None
    
    def calculate_strength(self, currencies: Optional[Dict[str, str]] = None) -> List[CurrencyScore]:
        """
        Calculate strength scores for all configured currencies.
        
        Args:
            currencies: Dict mapping currency codes to filenames (uses defaults if None)
            
        Returns:
            List of CurrencyScore dicts sorted by strength (descending)
        """
        currency_map = currencies or self.DEFAULT_CURRENCIES
        scores: List[CurrencyScore] = []
        
        for currency, filename in currency_map.items():
            score_data = self._load_currency_data(currency, filename)
            if score_data:
                scores.append(score_data)
        
        if not scores:
            logger.warning("No valid currency data loaded")
            return []
        
        # Sort by total score descending
        return sorted(scores, key=lambda x: x['Total_Score'], reverse=True)
    
    def display_results(self, scores: List[CurrencyScore]) -> None:
        """
        Display currency strength results in a formatted table.
        
        Args:
            scores: List of CurrencyScore dicts
        """
        if not scores:
            self.console.print("[bold red]No economic data available.[/bold red]")
            self.console.print("Run [green]global_runner.py[/green] to generate data.")
            return
        
        # Create rich table
        table = Table(title="🌍 Global Currency Strength Meter (Macro Sentiment)")
        table.add_column("Rank", style="cyan", justify="center")
        table.add_column("Currency", style="magenta", justify="center")
        table.add_column("Net Score", style="bold", justify="right")
        table.add_column("Avg / Indicator", style="yellow", justify="right")
        table.add_column("Data Points", style="dim white", justify="right")
        
        for rank, score_data in enumerate(scores, start=1):
            score = score_data['Total_Score']
            
            # Color-code scores
            if score > 0:
                score_str = f"[green]+{score}[/green]"
            elif score < 0:
                score_str = f"[red]{score}[/red]"
            else:
                score_str = "[white]0[/white]"
            
            table.add_row(
                str(rank),
                score_data['Currency'],
                score_str,
                str(score_data['Avg_Score']),
                str(score_data['Indicators'])
            )
        
        self.console.print(table)
        
        # Display summary
        strongest = scores[0]
        weakest = scores[-1]
        
        self.console.print(
            f"\n💪 [bold green]Strongest:[/bold green] {strongest['Currency']} "
            f"(Score: {strongest['Total_Score']})"
        )
        self.console.print(
            f"🥀 [bold red]Weakest:[/bold red]   {weakest['Currency']} "
            f"(Score: {weakest['Total_Score']})"
        )


def main() -> None:
    """CLI entry point"""
    try:
        meter = CurrencyStrengthMeter()
        scores = meter.calculate_strength()
        meter.display_results(scores)
    except Exception as e:
        logger.critical(f"Fatal error: {e}", exc_info=True)
        raise


if __name__ == "__main__":
    main()
