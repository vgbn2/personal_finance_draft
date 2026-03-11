import logging
import io
import matplotlib
matplotlib.use('Agg') # backend for server/bot use (no window pops up)
import matplotlib.pyplot as plt
import seaborn as sns
import yfinance as yf
import pandas as pd
from telegram import Update
from telegram.ext import ApplicationBuilder, ContextTypes, CommandHandler

# --- CONFIGURATION ---
BOT_TOKEN = "8207301195:AAEq4Ah1QYA1_80UjizynXENigqoEckjzxE"  # <--- PASTE YOUR TOKEN HERE

# --- THE BRAIN: Intelligence Pipeline (Modified for Bots) ---
class IntelligencePipeline:
    def __init__(self, ticker):
        self.ticker = ticker
        self.data = None
        self.stats = {}

    def fetch_and_process(self):
        # 1. Fetch
        self.data = yf.download(self.ticker, period="6mo", interval="1d", progress=False)
        if self.data.empty: return False
        
        # 2. Process (Flatten index if needed)
        if isinstance(self.data.columns, pd.MultiIndex):
            self.data.columns = self.data.columns.get_level_values(0)
            
        # Indicators
        self.data['Returns'] = self.data['Close'].pct_change()
        
        # RSI Logic
        delta = self.data['Close'].diff()
        gain = (delta.where(delta > 0, 0)).rolling(window=14).mean()
        loss = (-delta.where(delta < 0, 0)).rolling(window=14).mean()
        rs = gain / loss
        self.data['RSI'] = 100 - (100 / (1 + rs))
        
        # Stats
        current_rsi = self.data['RSI'].iloc[-1]
        self.stats = {
            'price': self.data['Close'].iloc[-1],
            'rsi': current_rsi,
            'rsi_status': "OVERBOUGHT" if current_rsi > 70 else "OVERSOLD" if current_rsi < 30 else "NEUTRAL"
        }
        return True

    def generate_chart_image(self):
        """
        Generates the chart and saves it to a memory buffer (RAM)
        instead of saving to a file on disk.
        """
        plt.figure(figsize=(10, 6))
        
        # Plot Price & RSI
        plt.subplot(2, 1, 1)
        plt.plot(self.data.index, self.data['Close'], label='Price', color='black')
        plt.title(f"{self.ticker} Price Action")
        plt.grid(True, alpha=0.3)
        
        plt.subplot(2, 1, 2)
        plt.plot(self.data.index, self.data['RSI'], color='purple', label='RSI')
        plt.axhline(70, color='red', linestyle='--')
        plt.axhline(30, color='green', linestyle='--')
        plt.title(f"RSI: {self.stats['rsi']:.2f}")
        plt.tight_layout()
        
        # Save to Buffer
        buf = io.BytesIO()
        plt.savefig(buf, format='png')
        buf.seek(0)  # Rewind to the beginning of the file
        plt.close()
        return buf

# --- THE BODY: Telegram Handlers ---

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text("🤖 Market Bot Online.\nUsage: /scan [ticker]\nExample: /scan BTC-USD")

async def scan(update: Update, context: ContextTypes.DEFAULT_TYPE):
    # 1. Get the ticker from the message (default to BTC if empty)
    args = context.args
    ticker = args[0] if args else "BTC-USD"
    ticker = ticker.upper()
    
    await update.message.reply_text(f"🔍 Scanning {ticker}... please wait.")

    # 2. Run the Intelligence Pipeline
    try:
        bot_brain = IntelligencePipeline(ticker)
        success = bot_brain.fetch_and_process()
        
        if not success:
            await update.message.reply_text(f"❌ Could not find data for {ticker}. Check the symbol.")
            return

        # 3. Get the Analysis
        stats = bot_brain.stats
        price = stats['price']
        rsi = stats['rsi']
        signal = stats['rsi_status']
        
        # 4. Create the Message
        msg = (
            f"📊 **ANALYSIS REPORT: {ticker}**\n"
            f"💰 Price: ${price:,.2f}\n"
            f"📈 RSI: {rsi:.2f} ({signal})\n\n"
            f"🤖 **SIGNAL:** {signal}"
        )
        
        # 5. Generate the Chart
        chart_buffer = bot_brain.generate_chart_image()
        
        # 6. Send Text AND Image
        await update.message.reply_photo(photo=chart_buffer, caption=msg)
        
    except Exception as e:
        await update.message.reply_text(f"⚠️ Error: {str(e)}")

# --- MAIN EXECUTION ---
if __name__ == '__main__':
    # Initialize the Bot Application
    app = ApplicationBuilder().token(BOT_TOKEN).build()
    
    # Register Commands
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("scan", scan))
    
    print("Bot is running... Press Ctrl+C to stop.")
    app.run_polling()