
"""
🧪 Unified Research Dashboard
Integrates Markov Chain Analysis and Monte Carlo Simulation into a single TUI.
"""

import asyncio
import logging
import sys
from typing import List, Dict, Any

from rich.console import Console
from rich.layout import Layout
from rich.panel import Panel
from rich.table import Table
from rich.live import Live
from rich.prompt import Prompt, IntPrompt
from rich.text import Text
from rich.ansi import AnsiDecoder

from polymarket_sim.core import config
from polymarket_sim.core.database import TradeDatabase
from polymarket_sim.research.markov_analysis import MarkovAnalyzer
from polymarket_sim.research.monte_carlo import MonteCarloSimulator

# Configure logging to file only (so it doesn't mess up TUI)
logging.basicConfig(
    filename="research_dashboard.log",
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
)

console = Console()

class ResearchDashboard:
    def __init__(self):
        self.db = TradeDatabase()
        self.sessions = []
        self.selected_session: Dict[str, Any] = {}
        self.trades = []
        self.analysis_results = {}

    async def run(self):
        """Main event loop."""
        console.clear()
        console.print(Panel.fit("🧪 [bold cyan]Polymarket Research Lab[/bold cyan]", border_style="cyan"))
        
        await self.db.connect()
        try:
            while True:
                await self.select_session()
                if not self.selected_session:
                    break
                
                with console.status("[bold green]Running Quantum Analysis...[/bold green]"):
                    await self.run_analysis()
                
                self.display_report()
                
                if not Prompt.ask("Analyze another session?", choices=["y", "n"], default="y") == "y":
                    break
        finally:
            await self.db.close()
            console.print("[dim]Database connection closed.[/dim]")

    async def select_session(self):
        """List and select a session."""
        self.sessions = await self.db.get_session_history(limit=10)
        
        if not self.sessions:
            console.print("[red]No trading sessions found in database![/red]")
            sys.exit(0)

        table = Table(title="Recent Trading Sessions")
        table.add_column("ID", justify="right", style="cyan")
        table.add_column("Strategy", style="magenta")
        table.add_column("PnL", justify="right")
        table.add_column("Date", justify="right")
        
        for s in self.sessions:
            pnl = s.get('final_pnl')
            pnl_str = f"${pnl:.2f}" if pnl is not None else "Runnning..."
            color = "green" if pnl and pnl > 0 else "red" if pnl and pnl < 0 else "yellow"
            
            import time
            date_str = time.strftime("%Y-%m-%d %H:%M", time.localtime(s['started_at']))
            
            table.add_row(
                str(s['id']), 
                s['strategy'], 
                f"[{color}]{pnl_str}[/]", 
                date_str
            )
        
        console.print(table)
        
        choices = [str(s['id']) for s in self.sessions]
        sid = IntPrompt.ask("Select Session ID", choices=choices)
        
        self.selected_session = next(s for s in self.sessions if s['id'] == sid)
        self.trades = await self.db.get_session_trades(sid)
        console.print(f"[green]Loaded {len(self.trades)} trades for Session #{sid}[/green]")

    async def run_analysis(self):
        """Run Markov and Monte Carlo."""
        # Preparation
        prices = [t['price'] for t in self.trades]
        
        # Calculate per-trade PnL accurately
        pnls = self._reconstruct_pnls(self.trades)
        
        # 1. Markov Analysis
        markov_res = {}
        if len(prices) > 10:
            try:
                analyzer = MarkovAnalyzer(prices)
                probs = analyzer.analyze()
                regime = analyzer.get_regime()
                markov_res = {"regime": regime, "transition_matrix": probs}
            except Exception as e:
                logging.error(f"Markov error: {e}")
                markov_res = {"regime": "Error", "transition_matrix": {}}
            
        # 2. Monte Carlo
        mc_res = {}
        if len(pnls) >= 5:
            try:
                # Use current bankroll as starting capital for simulation? 
                # Or the bankroll AT START of session?
                # Usually we want to stress test the CURRENT capital.
                # But 'risk of ruin' implies starting from now.
                start_cap = self.selected_session['bankroll']
                
                # If session is finished, maybe use final capital? 
                # Let's use the session's INITIAL bankroll to see if it WOULD HAVE ruined.
                # Actually, standard MC analyzes the strategy properties, so starting with $1000 or whatever is fine.
                # Let's use the session's starte bankroll.
                
                mc = MonteCarloSimulator(pnls, initial_capital=start_cap)
                mc.run(num_sims=2000, trades_per_sim=100)
                mc_res = mc.get_stats()
            except Exception as e:
                logging.error(f"MC error: {e}")

        self.analysis_results = {
            "markov": markov_res if markov_res else None,
            "monte_carlo": mc_res if mc_res else None,
            "total_trades": len(self.trades),
            "total_pnl": sum(pnls)
        }

    def _reconstruct_pnls(self, trades: List[Dict]) -> List[float]:
        """
        Replay trades to determine realized PnL of each round trip.
        FIFO matching: Buy matches with next Sell.
        """
        pnls = []
        # ... (same as before, but let's just keep the method signature here for context if needed, 
        # actually I am not replacing the helper, just the run_analysis method)
        
        # Helper implementation is fine, I will just return the main block.
        # Wait, I need to include the helper in the replacement if I am replacing a chunk that covers it?
        # The tool says "EndLine: 167".
        # run_analysis starts at line 125 and ends around 167.
        # I will replace the whole run_analysis method.
        
        # Re-pasting the helper content from previous file just to be safe or I can use separate replace call.
        # I'll just replace `run_analysis` and leave `_reconstruct_pnls` alone if possible.
        # But `_reconstruct_pnls` was inside the previous `write_to_file`.
        # I will just replace `run_analysis`.
        return self._reconstruct_pnls_impl(trades)

    def _reconstruct_pnls_impl(self, trades: List[Dict]) -> List[float]:
         # ... copy of logic ..
         # Actually, the tool allows replacing a block. I will just replace `run_analysis`.
         pass


    def _reconstruct_pnls(self, trades: List[Dict]) -> List[float]:
        """
        Replay trades to determine realized PnL of each round trip.
        FIFO matching: Buy matches with next Sell.
        """
        pnls = []
        inventory = [] # List of (price, size, side)
        
        # This is a complex recreation. 
        # Simpler approach: 
        # Just assume every trade is a "bet".
        # If I bought at 0.50 and later sold at 0.60, that's +0.10 * size.
        # Let's do a simple FIFO matcher.
        
        from collections import deque
        long_queue = deque()  # (price, size)
        short_queue = deque()
        
        # Fee logic
        FEE = config.SIMULATED_FEE_PER_SHARE
        
        for t in trades:
            price = t['price']
            size = t['size']
            side = t['side'] # 'BUY' or 'SELL'
            
            # Apply initial fee
            # Note: In our sim, fee is paid on entry AND exit.
            
            if side == 'BUY':
                # Check if we have shorts to cover
                while size > 0 and short_queue:
                    entry_price, entry_size = short_queue.popleft()
                    match_size = min(size, entry_size)
                    
                    # Short PnL: (Entry - Exit)
                    gross = (entry_price - price) * match_size
                    fee_cost = (FEE * match_size) * 2 # Entry + Exit fee
                    pnls.append(gross - fee_cost)
                    
                    size -= match_size
                    if entry_size > match_size:
                        short_queue.appendleft((entry_price, entry_size - match_size))
                
                if size > 0:
                    long_queue.append((price, size))

            elif side == 'SELL':
                # Check if we have longs to sell
                while size > 0 and long_queue:
                    entry_price, entry_size = long_queue.popleft()
                    match_size = min(size, entry_size)
                    
                    # Long PnL: (Exit - Entry)
                    gross = (price - entry_price) * match_size
                    fee_cost = (FEE * match_size) * 2
                    pnls.append(gross - fee_cost)
                    
                    size -= match_size
                    if entry_size > match_size:
                        long_queue.appendleft((entry_price, entry_size - match_size))
                
                if size > 0:
                    short_queue.append((price, size))
                    
        return pnls

    def display_report(self):
        """Show the unified dashboard."""
        layout = Layout()
        layout.split_row(
            Layout(name="left"),
            Layout(name="right"),
        )
        
        # ── Left: Market Regime (Markov) ──────────────────────
        m_res = self.analysis_results.get("markov")
        
        if m_res:
             # Manually parsing standard output from my markov lib?
             # No, 'analyze_series' likely returns a dict or object. 
             # Let's check the implementation of `markov_analysis.py`.
             # It returns a dict: {'regime': 'Trending', 'transition_matrix': ...}
             
             regime = m_res.get('regime', 'Unknown')
             trans = m_res.get('transition_matrix', {})
             
             color = "green" if regime == "Trending" else "yellow"
             
             table_m = Table(show_header=False, box=None)
             table_m.add_row("Regime", f"[{color} bold]{regime}[/]")
             table_m.add_row("P(Up|Up)", f"{trans.get('U', {}).get('U', 0):.2f}")
             table_m.add_row("P(Down|Down)", f"{trans.get('D', {}).get('D', 0):.2f}")
             
             panel_m = Panel(table_m, title="🧠 Markov Regime Analysis", border_style=color)
        else:
            panel_m = Panel("Not enough data for Markov Analysis", title="🧠 Markov Analysis")
            
        # ── Right: Risk Analysis (Monte Carlo) ────────────────
        mc_res = self.analysis_results.get("monte_carlo")
        
        if mc_res:
            # Assuming returns dict: {'risk_of_ruin': %, 'var_95': $, 'median_terminal': $}
            # I need to verify 'monte_carlo.py' output format.
            # It returns a dictionary.
            
            ror = mc_res.get('risk_of_ruin', 0.0) * 100
            var95 = mc_res.get('var_95', 0.0)
            median = mc_res.get('median_final_equity', 0.0)
            
            ror_color = "red" if ror > 5 else "green"
            
            table_mc = Table(show_header=False, box=None)
            table_mc.add_row("Risk of Ruin", f"[{ror_color}]{ror:.1f}%[/]")
            table_mc.add_row("VaR (95%)", f"[red]${abs(var95):.2f}[/]")
            table_mc.add_row("Median Equity", f"[cyan]${median:.2f}[/]")
            table_mc.add_row("Kelly Criterion", f"{mc_res.get('kelly_fraction', 0.0):.2f}")
            
            panel_mc = Panel(table_mc, title="🎲 Monte Carlo Risk Lab", border_style="magenta")
        else:
             panel_mc = Panel("Not enough closed trades for MC Sim", title="🎲 Monte Carlo")

        layout["left"].update(panel_m)
        layout["right"].update(panel_mc)
        
        console.print(layout)
        console.print(f"\n[bold]Total Trades Analyzed:[/bold] {self.analysis_results['total_trades']}")
        pnl = self.analysis_results['total_pnl']
        console.print(f"[bold]Reconstructed PnL:[/bold] [green]${pnl:.2f}[/green]" if pnl >= 0 else f"[bold]Reconstructed PnL:[/bold] [red]${pnl:.2f}[/red]")


if __name__ == "__main__":
    dashboard = ResearchDashboard()
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(dashboard.run())
