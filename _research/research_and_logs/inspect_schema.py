
import pandas as pd
import sys

# Force utf-8 for stdout if needed, but writing to file is safer
sys.stdout.reconfigure(encoding='utf-8')

try:
    with open('schema_info.txt', 'w', encoding='utf-8') as f:
        f.write('--- History ---\n')
        df1 = pd.read_excel('ptit_studies/data_science/pharma/pharma/DSLichSuGGMatHang6304_01302026163407.xlsx')
        f.write(str(df1.head()) + '\n')
        f.write(str(df1.columns.tolist()) + '\n')
        f.write('Unique values in Loại phiếu:\n')
        # Skip the first row which is secondary header
        f.write(str(df1.iloc[1:]['Loại phiếu'].unique()) + '\n\n')
        
        f.write('--- Drugs ---\n')
        df2 = pd.read_excel('ptit_studies/data_science/pharma/pharma/Drugs_6304_01302026162925.xlsx')
        f.write(str(df2.head()) + '\n')
        f.write(str(df2.columns.tolist()) + '\n')
        
    print("Schema info written to schema_info.txt")
except Exception as e:
    print(f"Error: {e}")
