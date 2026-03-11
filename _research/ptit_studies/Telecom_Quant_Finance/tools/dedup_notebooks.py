"""
Definitive Deduplication Script
================================
For each subject, keep ONLY the single best notebook (largest content).
Delete _Unified_Summary (always smallest), and the lesser of _Summary vs _LLM_Summary.
Also remove stray duplicates like "Lập trình mạng_Summary.ipynb" alongside the dated version.
"""
import os, json, sys, re
from collections import defaultdict

sys.stdout.reconfigure(encoding='utf-8')

ROOT = r"c:\Users\Lenovo\Desktop\VGBN\.vscode\CODEPTIT\ptit_studies\Telecom_Quant_Finance"
SUBDIRS = ["Computer_Science", "Math_Physics", "Signals_Systems"]

def get_base_name(filename):
    """Extract the base subject name from any notebook variant."""
    name = filename
    # Remove suffixes
    for suffix in ['_LLM_Summary.ipynb', '_Unified_Summary.ipynb', '_Summary.ipynb']:
        if name.endswith(suffix):
            name = name[:-len(suffix)]
            break
    # Remove year-date patterns like " - 2013", " - 2014", etc.
    name = re.sub(r'\s*-\s*\d{4}', '', name)
    return name.strip()

def get_content_size(filepath):
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            nb = json.load(f)
        return sum(len(''.join(c.get('source', []))) for c in nb.get('cells', []))
    except:
        return 0

def main():
    total_deleted = 0
    total_kept = 0
    
    for sd in SUBDIRS:
        path = os.path.join(ROOT, sd)
        if not os.path.exists(path):
            continue
        
        print(f"\n{'='*60}")
        print(f"  {sd}")
        print(f"{'='*60}")
        
        nbs = [f for f in os.listdir(path) if f.endswith('.ipynb')]
        
        # Group by base subject name
        groups = defaultdict(list)
        for nb in nbs:
            base = get_base_name(nb)
            groups[base].append(nb)
        
        for base, variants in sorted(groups.items()):
            if len(variants) <= 1:
                print(f"\n  ✓ {base}: Only 1 notebook, keeping it.")
                total_kept += 1
                continue
            
            print(f"\n  📋 {base}: {len(variants)} variants found")
            
            # Score each variant
            scored = []
            for v in variants:
                fp = os.path.join(path, v)
                size = get_content_size(fp)
                scored.append((size, v, fp))
            
            # Sort: largest content first
            scored.sort(key=lambda x: x[0], reverse=True)
            
            # Keep the best, delete the rest
            best_size, best_name, best_path = scored[0]
            print(f"      ★ KEEP: {best_name} ({best_size:,} chars)")
            total_kept += 1
            
            for size, name, fp in scored[1:]:
                print(f"      ✗ DELETE: {name} ({size:,} chars)")
                os.remove(fp)
                total_deleted += 1
    
    # Also delete _Unified_Summary notebooks that may have survived
    # (they should have been caught above, but just in case)
    
    print(f"\n{'='*60}")
    print(f"  DEDUP SUMMARY")
    print(f"{'='*60}")
    print(f"  Notebooks kept:    {total_kept}")
    print(f"  Notebooks deleted: {total_deleted}")

if __name__ == "__main__":
    main()
