import os
import pandas as pd
from rich.console import Console
from rich.table import Table

console = Console()

# Configuration: Currency -> CSV Filename
# Assumes files are in the same directory as this script
CURRENCY_FILES = {
    "USD": "us_economic_data.csv",
    "EUR": "eu_file.csv",
    "JPY": "japan_file.csv",
    "CAD": "ca_file.csv",
    "AUD": "au_file.csv",
    "NZD": "nz_file.csv",
    "CNY": "cn_file.csv",
    "CHF": "ch_file.csv"
}

def calculate_strength():
    scores = []

    # Get the directory of the current script to locate CSVs
    base_dir = os.path.dirname(os.path.abspath(__file__))

    for currency, filename in CURRENCY_FILES.items():
        file_path = os.path.join(base_dir, filename)
        
        if not os.path.exists(file_path):
            # Silently skip missing files so it works even if only some regions are active
            continue

        try:
            df = pd.read_csv(file_path)
            score_col = f"{currency}_Score"
            
            if score_col in df.columns:
                # Summing scores gives the aggregate macro sentiment
                # A high positive sum means many indicators are bullish for this currency
                total_score = df[score_col].sum()
                count = len(df)
                avg_score = total_score / count if count > 0 else 0.0
                
                scores.append({
                    "Currency": currency,
                    "Total Score": int(total_score),
                    "Avg Score": round(avg_score, 2),
                    "Indicators": count
                })
        except Exception as e:
            console.print(f"[red]Error reading {filename}: {e}[/red]")

    if not scores:
        console.print("[bold red]No economic data files found.[/bold red]")
        console.print("Please run [green]global_runner.py[/green] first to generate data.")
        return

    # Create DataFrame for sorting
    results_df = pd.DataFrame(scores)
    results_df.sort_values(by="Total Score", ascending=False, inplace=True)

    # Display Table
    table = Table(title="🌍 Global Currency Strength Meter (Macro Sentiment)")
    table.add_column("Rank", style="cyan", justify="center")
    table.add_column("Currency", style="magenta", justify="center")
    table.add_column("Net Score", style="bold", justify="right")
    table.add_column("Avg / Indicator", style="yellow", justify="right")
    table.add_column("Data Points", style="dim white", justify="right")

    for i, (_, row) in enumerate(results_df.iterrows()):
        score = row['Total Score']
        if score > 0:
            score_str = f"[green]+{score}[/green]"
        elif score < 0:
            score_str = f"[red]{score}[/red]"
        else:
            score_str = "[white]0[/white]"
            
        table.add_row(
            str(i + 1),
            row['Currency'],
            score_str,
            str(row['Avg Score']),
            str(row['Indicators'])
        )

    console.print(table)

    # Summary
    if not results_df.empty:
        strongest = results_df.iloc[0]
        weakest = results_df.iloc[-1]
        
        console.print(f"\n💪 [bold green]Strongest Currency:[/bold green] {strongest['Currency']} (Score: {strongest['Total Score']})")
        console.print(f"🥀 [bold red]Weakest Currency:[/bold red]   {weakest['Currency']} (Score: {weakest['Total Score']})")

if __name__ == "__main__":
    calculate_strength()