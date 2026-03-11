
# Pharma Time Series Analysis Notebook Overview

This readme provides a detailed explanation of each section and cell in the `Pharma_Time_Series_Analysis.ipynb` notebook. This notebook is designed to analyze pharmaceutical sales data, covering time series trends, regression analysis, financial performance (ROI), and inventory optimization strategy.

## 1. Imports and Setup
*   **Cell 1 [Markdown]**: Title and brief description of the notebook.
*   **Cell 2 [Code]**: Imports necessary libraries:
    *   `pandas` & `numpy`: For data manipulation and numerical operations.
    *   `matplotlib.pyplot` & `seaborn`: For data visualization.
    *   `sklearn.linear_model.LinearRegression`: For linear trend analysis.
    *   `sklearn.preprocessing.PolynomialFeatures`: For non-linear trend analysis.
    *   `sklearn.metrics`: `r2_score` and `mean_squared_error` for evaluating model performance.
    *   Sets plotting styles (seaborn whitegrid) and default figure size.

## 2. Data Loading & Preprocessing
*   **Cell 3 [Markdown]**: Header for Data Loading section.
*   **Cell 4 [Code]**:
    *   Loads sales history from `DSLichSuGGMatHang6304_01302026163407.xlsx`.
    *   Filters the dataset to include only 'Xuất Bán' (Sales) transactions.
    *   Converts `NoteDate` to datetime format.
    *   Drops rows with missing dates or quantities.
    *   Prints total records and the date range of the dataset.
    *   Displays the first few rows of the cleaned sales dataframe (`df_sales`).

## 3. Time Feature Engineering
*   **Cell 5 [Markdown]**: Header for Feature Engineering.
*   **Cell 6 [Code]**:
    *   Extracts time-based features from `NoteDate`: `Weekday`, `Month`, `DayOfMonth`, `Year`.
    *   Defines a function `get_season(month)` to map months to seasons (Spring, Summer, Autumn, Winter).
    *   Applies this function to create a `Season` column.
    *   Displays the first 10 rows with these new features.

## 4. Sales Aggregation & Visualization
*   **Cell 7 [Markdown]**: Header for Daily Sales Aggregation.
*   **Cell 8 [Code]**:
    *   Aggregates sales quantity by date (`daily_sales`).
    *   Adds a `DayNumber` column (1 to N) for regression analysis.
    *   Prints descriptive statistics: number of days, average daily sales, and standard deviation.
*   **Cell 9 [Markdown]**: Header for Weekly Sales Distribution.
*   **Cell 10 [Code]**:
    *   Calculates total transaction counts per day of the week.
    *   Plots a line chart showing sales distribution from Monday to Sunday.
    *   Identifies and prints the busiest day of the week.
*   **Cell 11 [Markdown]**: Header for Monthly Sales Distribution.
*   **Cell 12 [Code]**:
    *   Counts transactions per month.
    *   Plots a bar chart of monthly sales activity.
*   **Cell 13 [Markdown]**: Header for Seasonal Sales Analysis.
*   **Cell 14 [Code]**:
    *   Defines `get_top_items_by_season` function.
    *   Loops through each season to identify and print the top 20 selling products (by quantity).

## 5. Regression Analysis (Trends)
*   **Cell 15 [Markdown]**: Header for Linear Regression.
*   **Cell 16 [Code]**:
    *   Fits a **Linear Regression** model to daily sales data (`DayNumber` vs. `TotalQuantity`).
    *   Calculates Slope, Intercept, R² Score, and RMSE.
    *   Visualizes the daily sales data with the linear trend line.
    *   Prints a text summary indicating if the overall trend is increasing or decreasing.
*   **Cell 17 [Markdown]**: Header for Polynomial Regression.
*   **Cell 18 [Code]**:
    *   Fits **Polynomial Regression** models (Degree 2 and 3) to capture non-linear patterns.
    *   Visualizes the actual data against the linear, quadratic, and cubic trend lines.
    *   Compares models using R² Score and RMSE to determine which best fits the data.
*   **Cell 19 [Markdown]**: Header for Weekly Trend Analysis.
*   **Cell 20 [Code]**:
    *   Resamples data to **Weekly** frequency.
    *   Performs linear regression on weekly aggregates.
    *   Visualizes weekly sales trends.
*   **Cell 21 [Markdown]**: Header for Monthly Trend Analysis.
*   **Cell 22 [Code]**:
    *   Resamples data to **Monthly** frequency.
    *   Performs linear regression on monthly aggregates.
    *   Visualizes monthly sales trends.
*   **Cell 23 [Code]**:
    *   Prints a comprehensive summary of all regression analyses (Daily, Weekly, Monthly), comparing growth rates (units/time period) and model accuracy (R²).

## 6. Product Return & Time Decay Analysis (Financials)
*   **Cell 24 [Markdown]**: Header for Product Return & Time Decay Analysis.
*   **Cell 25 [Code]**:
    *   Loads the cost master file: `Drugs_6304_01302026162925.xlsx`.
    *   Cleans column names and standardizes `BuyPrice`.
    *   Reports the number of unique drugs loaded for cost lookup.
*   **Cell 26 [Code]**:
    *   **Merges** Sales data with Cost data based on drug name (fuzzy matching using lowercase).
    *   Calculates financial metrics:
        *   `Revenue` = Price * Quantity
        *   `Cost` = BuyPrice * Quantity
        *   `Flat_Return` (Profit) = Revenue - Cost
        *   `Unit_ROI` (Return on Investment) = (Price - BuyPrice) / BuyPrice.
    *   Displays the top 5 high-value sales transactions.
*   **Cell 27 [Code]**:
    *   **Parses Expiry Dates**: Extracts valid dates from the `SerialNumberAndExpDqate` column.
    *   Calculates `DaysToExpiry` (Expiry Date - Sale Date).
    *   Categorizes sales into **Freshness Buckets**: <30 Days, 30-90 Days, 90-180 Days, 6-12 Months, >1 Year.
    *   Computes average ROI for each freshness bucket to test the "Time Decay" hypothesis (do older items have lower margins?).
*   **Cell 28 [Code]**:
    *   Generates four key visualizations:
        1.  **Top 10 Products by Total Profit** (Bar Chart).
        2.  **Top 10 Products by Avg ROI** (Bar Chart).
        3.  **ROI vs. Days to Expiry** (Scatter Plot): Visualizes if margins shrink as products approach expiry.
        4.  **Average ROI by Freshness** (Bar Chart): Aggregated view of time decay impact.

## 7. Inventory Optimization (ABC/XYZ Analysis)
*   **Cell 29 [Markdown]**: Header for Inventory Optimization.
*   **Cell 30 [Code]**:
    *   Defines functions for inventory classification:
        *   `perform_abc_analysis`: Classifies items based on revenue contribution (A=Top 80%, B=Next 15%, C=Bottom 5%).
        *   `perform_xyz_analysis`: Classifies items based on demand variability/coefficient of variation (X=Steady, Y=Variable, Z=Erratic).
*   **Cell 31 [Code]**:
    *   Runs the ABC and XYZ analyses on the sales dataset.
    *   Generates strategic recommendations for each Class combination (e.g., "AX" -> JIT Replenishment, "CZ" -> Review for De-listing).
    *   Displays a summary matrix of product counts per category.
    *   Visualizes the **Inventory Strategy Matrix** as a Heatmap.

---
**Note**: This notebook integrates data processing, statistical modeling, financial analysis, and inventory strategy into a single workflow. Ensure the Excel source files are present in the same directory for the code to execute successfully.
