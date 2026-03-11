"""
Comprehensive Audit & Cleanup Script for Telecom_Quant_Finance Hub
==================================================================
1. Strip crowded source-file headlines from glossary/formula entries in _LLM_Summary notebooks
2. Detect and remove lesser duplicate notebooks (_Summary, _Unified_Summary) when _LLM_Summary exists
3. Check simulation notebooks for empty code cells or missing Python code
4. Report formatting issues
"""

import os
import json
import re
import sys
import shutil
from collections import defaultdict

sys.stdout.reconfigure(encoding='utf-8')

ROOT = r"c:\Users\Lenovo\Desktop\VGBN\.vscode\CODEPTIT\ptit_studies\Telecom_Quant_Finance"
SUBDIRS = ["Computer_Science", "Math_Physics", "Signals_Systems"]

# ========================================================================
# 1. STRIP SOURCE-FILE HEADLINES FROM LLM SUMMARY NOTEBOOKS
# ========================================================================
# Pattern: "[Bài giảng Thống kê doanh nghiệp - 2019.pdf] **Term**: Definition"
#       -> "**Term**: Definition"
# Also:  "[Toán kỹ thuật - 2013.pdf] **Formula**: $$...$$"
#       -> "**Formula**: $$...$$"
HEADLINE_PATTERN = re.compile(r'\[.*?\.pdf\]\s*')

def strip_headlines_from_notebook(nb_path):
    """Remove source-file prefixes from every glossary/formula entry."""
    with open(nb_path, 'r', encoding='utf-8') as f:
        nb = json.load(f)
    
    modified = False
    for cell in nb.get('cells', []):
        if cell.get('cell_type') != 'markdown':
            continue
        
        new_source = []
        source_lines = cell.get('source', [])
        
        for line in source_lines:
            cleaned = HEADLINE_PATTERN.sub('', line)
            if cleaned != line:
                modified = True
            new_source.append(cleaned)
        
        cell['source'] = new_source
    
    if modified:
        with open(nb_path, 'w', encoding='utf-8') as f:
            json.dump(nb, f, ensure_ascii=False, indent=1)
    
    return modified

# ========================================================================
# 2. DETECT AND REMOVE LESSER DUPLICATE NOTEBOOKS
# ========================================================================
def find_notebook_groups(subdir_path):
    """Group notebooks by base subject name, identify duplicates."""
    notebooks = [f for f in os.listdir(subdir_path) if f.endswith('.ipynb')]
    
    groups = defaultdict(dict)
    for nb in notebooks:
        if nb.endswith('_LLM_Summary.ipynb'):
            base = nb.replace('_LLM_Summary.ipynb', '')
            groups[base]['llm'] = nb
        elif nb.endswith('_Unified_Summary.ipynb'):
            base = nb.replace('_Unified_Summary.ipynb', '')
            groups[base]['unified'] = nb
        elif nb.endswith('_Summary.ipynb'):
            base = nb.replace('_Summary.ipynb', '')
            groups[base]['summary'] = nb
    
    return groups

def compare_notebook_quality(path):
    """Get quality metrics: cell count, total content length, glossary count, formula count."""
    try:
        with open(path, 'r', encoding='utf-8') as f:
            nb = json.load(f)
        
        cells = nb.get('cells', [])
        total_len = sum(len(''.join(c.get('source', []))) for c in cells)
        glossary_count = 0
        formula_count = 0
        
        for cell in cells:
            if cell.get('cell_type') == 'markdown':
                text = ''.join(cell.get('source', []))
                if '📖 Glossary' in text or '## Glossary' in text:
                    glossary_count = text.count('- ')
                if '🧮 Formulas' in text or '## Formulas' in text:
                    formula_count = text.count('- ')
        
        return {
            'cells': len(cells),
            'content_length': total_len,
            'glossary': glossary_count,
            'formulas': formula_count,
            'size_bytes': os.path.getsize(path)
        }
    except Exception as e:
        return {'cells': 0, 'content_length': 0, 'glossary': 0, 'formulas': 0, 'size_bytes': 0, 'error': str(e)}

# ========================================================================
# 3. CHECK SIMULATION NOTEBOOKS
# ========================================================================
def check_simulation(nb_path):
    """Check if a simulation notebook has valid Python code."""
    with open(nb_path, 'r', encoding='utf-8') as f:
        nb = json.load(f)
    
    issues = []
    has_code = False
    
    for cell in nb.get('cells', []):
        if cell.get('cell_type') == 'code':
            source = ''.join(cell.get('source', []))
            if not source.strip():
                issues.append("Empty code cell")
            elif len(source.strip()) < 20:
                issues.append(f"Very short code cell ({len(source.strip())} chars)")
            else:
                has_code = True
                # Check for common issues
                if 'import' not in source:
                    issues.append("No imports found in code")
    
    if not has_code:
        issues.append("NO executable Python code found!")
    
    return issues

# ========================================================================
# 4. CHECK FORMATTING ISSUES IN NOTEBOOKS
# ========================================================================
def check_formatting(nb_path):
    """Detect common formatting issues in notebook markdown."""
    with open(nb_path, 'r', encoding='utf-8') as f:
        nb = json.load(f)
    
    issues = []
    for i, cell in enumerate(nb.get('cells', [])):
        if cell.get('cell_type') != 'markdown':
            continue
        text = ''.join(cell.get('source', []))
        
        # Check for broken LaTeX (unmatched $$)
        dollar_count = text.count('$$')
        if dollar_count % 2 != 0:
            issues.append(f"Cell {i}: Unmatched $$ (LaTeX block not closed)")
        
        # Check for empty cells
        if not text.strip():
            issues.append(f"Cell {i}: Empty markdown cell")
        
        # Check for extremely long single-line entries (readability)
        for line in text.split('\n'):
            if len(line) > 500:
                issues.append(f"Cell {i}: Very long line ({len(line)} chars)")
                break
    
    return issues

# ========================================================================
# MAIN AUDIT
# ========================================================================
def main():
    print("=" * 70)
    print("  TELECOM QUANT FINANCE HUB — COMPREHENSIVE AUDIT & CLEANUP")
    print("=" * 70)
    
    total_headlines_stripped = 0
    total_duplicates_removed = 0
    total_formatting_issues = 0
    total_simulation_issues = 0
    files_to_delete = []
    
    for subdir in SUBDIRS:
        subdir_path = os.path.join(ROOT, subdir)
        if not os.path.exists(subdir_path):
            continue
        
        print(f"\n{'─' * 60}")
        print(f"  📂 {subdir}")
        print(f"{'─' * 60}")
        
        # ── Step 1: Strip headlines from LLM Summary notebooks ──
        print("\n  [1] Stripping source-file headlines...")
        for f in os.listdir(subdir_path):
            if f.endswith('_LLM_Summary.ipynb'):
                path = os.path.join(subdir_path, f)
                if strip_headlines_from_notebook(path):
                    print(f"      ✓ Cleaned: {f}")
                    total_headlines_stripped += 1
                else:
                    print(f"      · Already clean: {f}")
        
        # ── Step 2: Detect duplicates ──
        print("\n  [2] Checking for duplicate notebooks...")
        groups = find_notebook_groups(subdir_path)
        
        for base, types in groups.items():
            if 'llm' in types and ('summary' in types or 'unified' in types):
                llm_path = os.path.join(subdir_path, types['llm'])
                llm_quality = compare_notebook_quality(llm_path)
                
                # If LLM version exists and is substantial, mark the lesser ones for deletion
                if llm_quality['content_length'] > 500:
                    if 'unified' in types:
                        unified_path = os.path.join(subdir_path, types['unified'])
                        unified_q = compare_notebook_quality(unified_path)
                        if llm_quality['content_length'] > unified_q['content_length']:
                            files_to_delete.append(unified_path)
                            print(f"      ✗ REMOVE (lesser): {types['unified']} ({unified_q['size_bytes']}B vs LLM {llm_quality['size_bytes']}B)")
                            total_duplicates_removed += 1
                        else:
                            print(f"      ? KEEP (larger than LLM): {types['unified']}")
                    
                    if 'summary' in types:
                        summary_path = os.path.join(subdir_path, types['summary'])
                        summary_q = compare_notebook_quality(summary_path)
                        if llm_quality['content_length'] > summary_q['content_length']:
                            files_to_delete.append(summary_path)
                            print(f"      ✗ REMOVE (lesser): {types['summary']} ({summary_q['size_bytes']}B vs LLM {llm_quality['size_bytes']}B)")
                            total_duplicates_removed += 1
                        else:
                            print(f"      ? KEEP (larger than LLM): {types['summary']}")
                else:
                    print(f"      ⚠ LLM Summary for '{base}' is very small ({llm_quality['content_length']} chars), keeping all versions")
        
        # ── Step 3: Check formatting ──
        print("\n  [3] Checking formatting issues...")
        for f in os.listdir(subdir_path):
            if f.endswith('.ipynb'):
                path = os.path.join(subdir_path, f)
                issues = check_formatting(path)
                if issues:
                    print(f"      ⚠ {f}:")
                    for issue in issues:
                        print(f"         - {issue}")
                        total_formatting_issues += 1
        
        # ── Step 4: Check simulations ──
        sim_dir = os.path.join(subdir_path, "simulations")
        if os.path.exists(sim_dir):
            print(f"\n  [4] Checking simulation notebooks in {subdir}/simulations/...")
            for f in os.listdir(sim_dir):
                if f.endswith('.ipynb'):
                    path = os.path.join(sim_dir, f)
                    issues = check_simulation(path)
                    if issues:
                        print(f"      ⚠ {f}:")
                        for issue in issues:
                            print(f"         - {issue}")
                            total_simulation_issues += 1
                    else:
                        print(f"      ✓ {f}: Valid")
    
    # ── Also check root-level files ──
    print(f"\n{'─' * 60}")
    print(f"  📂 Root Level")
    print(f"{'─' * 60}")
    root_ipynb = [f for f in os.listdir(ROOT) if f.endswith('.ipynb')]
    for f in root_ipynb:
        path = os.path.join(ROOT, f)
        issues = check_formatting(path)
        if issues:
            print(f"  ⚠ {f}: {len(issues)} formatting issues")
            total_formatting_issues += len(issues)

    # ── Summary ──
    print(f"\n{'=' * 70}")
    print(f"  AUDIT SUMMARY")
    print(f"{'=' * 70}")
    print(f"  Headlines stripped:       {total_headlines_stripped} notebooks cleaned")
    print(f"  Duplicates to remove:     {total_duplicates_removed} files")
    print(f"  Formatting issues found:  {total_formatting_issues}")
    print(f"  Simulation issues found:  {total_simulation_issues}")
    
    # ── Execute deletions ──
    if files_to_delete:
        print(f"\n  Deleting {len(files_to_delete)} lesser duplicate files...")
        for fp in files_to_delete:
            try:
                os.remove(fp)
                print(f"      🗑 Deleted: {os.path.basename(fp)}")
            except Exception as e:
                print(f"      ✗ Failed to delete {os.path.basename(fp)}: {e}")
    
    print(f"\n{'=' * 70}")
    print("  CLEANUP COMPLETE!")
    print(f"{'=' * 70}")

if __name__ == "__main__":
    main()
