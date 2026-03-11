from typing import Optional
from src.models.order import Order
from src.models.signal import Signal
from src.utils.logger import logger
from src.config import config


class OrderExecutor:
    """
    Executes orders based on signals from the strategy engine.
    
    Handles order creation, submission, and tracking.
    """
    
    def __init__(self):
        self.pending_orders: dict[str, Order] = {}
        self.filled_orders: dict[str, Order] = {}
    
    async def execute_signal(self, signal: Signal, bankroll: float) -> Optional[Order]:
        """
        Execute a trading signal.
        
        Args:
            signal: Trading signal from strategy
            bankroll: Total bankroll for sizing
            
        Returns:
            Created order or None
        """
        size_usd = bankroll * signal.size_pct
        
        order = Order(
            market_id=signal.market_id,
            side="BUY",
            outcome=signal.outcome,
            order_type="LIMIT",
            price=signal.entry_price,
            size=size_usd,
            size_pct=signal.size_pct
        )
        
        # Validate order
        if not self._validate_order(order):
            logger.warning(f"Order validation failed: {order}")
            return None
        
        # Submit order
        order_id = await self._submit_order(order)
        
        if order_id:
            order.order_id = order_id
            self.pending_orders[order_id] = order
            logger.info(f"Order submitted: {order_id} | {signal.outcome} @ {signal.entry_price:.4f}")
            return order
        else:
            logger.error(f"Failed to submit order for {signal.market_id}")
            return None
    
    def _validate_order(self, order: Order) -> bool:
        """Validate order parameters."""
        if order.size <= 0:
            return False
        
        if order.price <= 0 or order.price >= 1.0:
            return False
        
        if order.size > config.MAX_POSITION_SIZE * 100000:  # Max position check
            return False
        
        return True
    
    async def _submit_order(self, order: Order) -> Optional[str]:
        """
        Submit order to Polymarket.
        
        This is a placeholder - actual implementation would use web3.py
        to sign and submit transactions.
        """
        # TODO: Implement actual order submission
        # This would use:
        # 1. Construct EIP-712 order message
        # 2. Sign with private key
        # 3. Submit to CLOB contract
        
        import uuid
        return str(uuid.uuid4())
    
    async def cancel_order(self, order_id: str) -> bool:
        """Cancel a pending order."""
        if order_id in self.pending_orders:
            # TODO: Submit cancel to exchange
            order = self.pending_orders[order_id]
            order.status = "CANCELLED"
            del self.pending_orders[order_id]
            logger.info(f"Order cancelled: {order_id}")
            return True
        return False
    
    async def on_order_filled(self, order_id: str, filled_size: float):
        """Handle order fill notification."""
        if order_id in self.pending_orders:
            order = self.pending_orders[order_id]
            order.filled_size = filled_size
            
            if order.is_filled:
                order.status = "FILLED"
                self.filled_orders[order_id] = order
                del self.pending_orders[order_id]
                logger.info(f"Order filled: {order_id}")
            else:
                order.status = "PARTIAL"
                logger.info(f"Order partial fill: {order_id} {filled_size}/{order.size}")
    
    def get_position(self, market_id: str) -> float:
        """Get current position in a market."""
        total = 0.0
        for order in self.filled_orders.values():
            if order.market_id == market_id:
                if order.side == "BUY":
                    total += order.filled_size
                else:
                    total -= order.filled_size
        return total


class NonceManager:
    """Manages transaction nonces for on-chain execution."""
    
    def __init__(self):
        self.nonces: dict[str, int] = {}
        self._cache = {}
    
    def get_nonce(self, address: str) -> int:
        """Get next nonce for address."""
        if address not in self.nonces:
            # Would fetch from chain
            self.nonces[address] = 0
        return self.nonces[address]
    
    def increment_nonce(self, address: str):
        """Increment nonce after transaction."""
        if address in self.nonces:
            self.nonces[address] += 1
        else:
            self.nonces[address] = 1
