/**
 * Exercise 5: Live Chart Component
 * 
 * Objective: Use lightweight-charts to render a price line.
 * 
 * Instructions:
 * 1. Reference the lightweight-charts documentation.
 * 2. Create a container div with a ref.
 * 3. Use useMarketDataStore to get live price updates.
 * 4. Update the series data when the price changes.
 */

import React, { useEffect, useRef } from 'react';
import { createChart } from 'lightweight-charts';
// import { useMarketDataStore } from '../src/stores/marketDataStore';

export const PriceChart: React.FC<{ symbol: string }> = ({ symbol }) => {
    const chartContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!chartContainerRef.current) return;

        const chart = createChart(chartContainerRef.current, {
            width: 600,
            height: 300,
        });
        const lineSeries = chart.addLineSeries();

        // TODO: Subscribe to store and update lineSeries

        return () => chart.remove();
    }, [symbol]);

    return <div ref={chartContainerRef} />;
};
