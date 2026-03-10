import os
import sys
import asyncio
import json
from datetime import datetime, timedelta, timezone

import aiohttp
from dotenv import load_dotenv
from py_clob_client.client import ClobClient
from py_clob_client.clob_types import OrderArgs
from py_clob_client.constants import POLYGON
from rich.console import Console
from rich.table import Table
from rich.panel import Panel
from rich.prompt import Prompt, FloatPrompt, IntPrompt, Confirm

# --- CONFIGURATION ---
load_dotenv()
PRIVATE_KEY = os.getenv("PRIVATE_KEY")
POLYMARKET_PROXY = os.getenv("POLYMARKET_PROXY")
CLOB_API = "https://clob.polymarket.com"
GAMMA_MARKETS_URL = "https://gamma-api.polymarket.com/markets"

console = Console()

if not PRIVATE_KEY:
    console.print("[bold red]Error:[/bold red] PRIVATE_KEY not found in .env")
    sys.exit(1)

def init_client():
    try:
        client = ClobClient(
            host=CLOB_API,
            key=PRIVATE_KEY,
            chain_id=POLYGON,
            signature_type=2,
            funder=POLYMARKET_PROXY
        )
        client.set_api_creds(client.create_or_derive_api_creds())
        return client
    except Exception as e:
        console.print(f"[bold red]Client Init Failed:[/bold red] {e}")
        sys.exit(1)

def get_15min_window_epoch(offset=0):
    now = int(datetime.now(timezone.utc).timestamp())
    window = 900
    start = (now // window) * window
    return start + (offset * window)

async def get_market_price(client, token_id):
    """Fetches the lowest ask price for a token."""
    try:
        book = await asyncio.to_thread(client.get_order_book, token_id)
        # Handle different response structures
        asks = getattr(book, 'asks', [])
        if not asks and isinstance(book, dict):
            asks = book.get('asks', [])
        
        if asks:
            # Price is usually the first element if it's a list of lists, or .price attribute
            p = asks[0].price if hasattr(asks[0], 'price') else asks[0][0]
            return float(p)
    except Exception:
        pass
    return None

async def scan_markets(session):
    console.print("[cyan]Scanning for active 15-min markets (BTC, ETH, SOL, XRP)...[/cyan]")
    markets = []
    
    # Scan current and next window
    for offset in [0, 1]:
        epoch = get_15min_window_epoch(offset)
        for asset in ['btc', 'eth', 'sol', 'xrp']:
            slug = f"{asset}-updown-15m-{epoch}"
            try:
                url = f"{GAMMA_MARKETS_URL.replace('/markets', '')}/events"
                async with session.get(url, params={"slug": slug}) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        if data and not data[0].get('closed'):
                            m = data[0]['markets'][0]
                            end_dt = datetime.fromisoformat(m['endDate'].replace('Z', '+00:00'))
                            if end_dt > datetime.now(timezone.utc):
                                t_ids = json.loads(m['clobTokenIds']) if isinstance(m['clobTokenIds'], str) else m['clobTokenIds']
                                markets.append({
                                    "slug": slug,
                                    "question": m['question'],
                                    "end": end_dt.strftime("%H:%M:%S"),
                                    "token_yes": t_ids[0],
                                    "token_no": t_ids[1]
                                })
            except Exception:
                continue
    return markets

async def place_order_flow(client, default_token=None, market_name="Unknown"):
    console.print(Panel(f"🔵 [bold]Place New Order[/bold] | Market: {market_name}", border_style="blue"))
    
    token_id = default_token
    if not token_id:
        token_id = Prompt.ask("Enter Token ID")
    
    # Show current price hint
    current_price = await get_market_price(client, token_id)
    price_hint = f"(Current Ask: {current_price})" if current_price else "(No active asks)"
    
    side = Prompt.ask("Side", choices=["BUY", "SELL"], default="BUY")
    price = FloatPrompt.ask(f"Price {price_hint}")
    size = FloatPrompt.ask("Size (Shares)")
    
    # Confirm
    console.print(f"\n[yellow]Review:[/yellow] {side} {size} shares @ {price} (Token: ...{str(token_id)[-6:]})")
    if not Confirm.ask("Execute?"):
        console.print("[red]Cancelled.[/red]")
        return

    try:
        # 5 Minute Expiration for manual orders
        expiration = int((datetime.now(timezone.utc) + timedelta(minutes=5)).timestamp())
        order = OrderArgs(
            price=price,
            size=size,
            side=side,
            token_id=token_id,
            expiration=expiration
        )
        
        with console.status("Sending order..."):
            signed = await asyncio.to_thread(client.create_order, order)
            resp = await asyncio.to_thread(client.post_order, signed, orderType="GTD")
            
        if isinstance(resp, dict) and resp.get("orderID"):
            console.print(f"[bold green]Success![/bold green] Order ID: {resp['orderID']}")
        else:
            console.print(f"[bold red]Failed:[/bold red] {resp}")
            
    except Exception as e:
        console.print(f"[bold red]Error:[/bold red] {e}")

async def main():
    client = init_client()
    console.print(f"[green]Connected as {POLYMARKET_PROXY}[/green]")
    
    async with aiohttp.ClientSession() as session:
        while True:
            console.print("\n[bold]MAIN MENU[/bold]")
            console.print("1. Scan & Trade 15m Markets")
            console.print("2. Manual Order (Enter Token ID)")
            console.print("3. Exit")
            
            choice = Prompt.ask("Select", choices=["1", "2", "3"])
            
            if choice == "1":
                markets = await scan_markets(session)
                if not markets:
                    console.print("[yellow]No active markets found.[/yellow]")
                    continue
                
                table = Table(title="Active Markets")
                table.add_column("#", style="cyan")
                table.add_column("Slug", style="magenta")
                table.add_column("End Time", style="green")
                
                for idx, m in enumerate(markets):
                    table.add_row(str(idx+1), m['slug'], m['end'])
                
                console.print(table)
                
                sel = IntPrompt.ask("Select Market # (0 to cancel)", default=0)
                if sel > 0 and sel <= len(markets):
                    m = markets[sel-1]
                    side = Prompt.ask("Trade which side?", choices=["YES", "NO"])
                    token = m['token_yes'] if side == "YES" else m['token_no']
                    await place_order_flow(client, default_token=token, market_name=m['slug'])
                    
            elif choice == "2":
                await place_order_flow(client)
                
            elif choice == "3":
                break

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        console.print("\n[yellow]Exiting...[/yellow]")