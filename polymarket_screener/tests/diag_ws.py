import asyncio
import json
import websockets

async def check_binance():
    url = "wss://stream.binance.com:9443/ws/btcusdt@kline_1m"
    async with websockets.connect(url) as ws:
        print("Connected to Binance WS")
        for _ in range(3):
            msg = await ws.recv()
            data = json.loads(msg)
            print(f"Binance Data: {data['s']} Price={data['k']['c']}")

async def check_deribit():
    url = "wss://www.deribit.com/ws/api/v2"
    async with websockets.connect(url) as ws:
        print("Connected to Deribit WS")
        msg = {
            "jsonrpc": "2.0",
            "method": "public/subscribe",
            "params": {"channels": ["deribit_price_index.btc_usd"]},
            "id": 1
        }
        await ws.send(json.dumps(msg))
        for _ in range(3):
            msg = await ws.recv()
            data = json.loads(msg)
            if "params" in data:
                print(f"Deribit Data: {data['params']['channel']} Price={data['params']['data']['price']}")

async def main():
    try:
        await asyncio.wait_for(asyncio.gather(check_binance(), check_deribit()), timeout=15)
    except asyncio.TimeoutError:
        print("Done.")

if __name__ == "__main__":
    asyncio.run(main())
