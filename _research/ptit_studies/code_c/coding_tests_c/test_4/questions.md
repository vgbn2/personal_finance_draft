# Test 4 (Advanced)

## 1. Number Theory: Prime Factorization of N!
Find the **prime factorization of N!** (N factorial).
Output prime factors and their powers as P^E.

- **Input**: Integer N.
- **Output**: Factorization string.
- **Test Cases**: 5 inputs (e.g., 5, 10, 20).
- **Example**:
    - Input: `5` (5! = 120 = 2^3 * 3^1 * 5^1)
    - Output: `2^3 3^1 5^1`

## 2. Strings: Common Characters
Given two strings S1 and S2, find all characters that appear in **both** strings.
Print them in alphabetical order (no duplicates).

- **Input**: String S1, String S2.
- **Output**: Common characters string.
- **Example**:
    - Input: `"apple"`, `"pear"`
    - Output: `"aep"` (a, e, p are common).

## 3. Structs: Complex Numbers
Define a `Complex` number struct (real, imag). Write functions to add and multiply complex numbers.
(a + bi) + (c + di) = (a+c) + (b+d)i
(a + bi) * (c + di) = (ac - bd) + (ad + bc)i

- **Input**: Two complex numbers.
- **Output**: Their Sum and Product.
- **Example**:
    - Input: `1 2` (1+2i), `3 4` (3+4i)
    - Sum: `4 6` (4+6i)
    - Product: `-5 10` (-5+10i)

## 4. Search: Rotated Sorted Array
Implement **Binary Search** in a **Rotated Sorted Array**.
A sorted array is rotated at some pivot unknown to you beforehand.
(e.g., `0 1 2 4 5 6 7` -> `4 5 6 7 0 1 2`).

- **Input**: Rotated Array A, Target T.
- **Output**: Index of T or -1 if not found.
- **Test Cases**: 10 cases, including edge cases.
- **Example**:
    - Input: `4 5 6 7 0 1 2`, Target `0`
    - Output: `4` (Index of 0).

## 5. Matrix: Saddle Points
Find all **Saddle Points** in a matrix.
A Saddle Point is an element that is the minimum in its row and maximum in its column.

- **Input**: NxM Matrix.
- **Output**: Value and coordinates of Saddle Points.
- **Example**:
    - Input:
      ```
      1 2 3
      4 5 6
      7 8 9
      ```
    - Output: `7` (at 2,0: min in row 3 is 7, max in col 1 is 7).
    - Note: In standard def, 7 is min in row (7,8,9) -> 7. Max in col (1,4,7) -> 7. So 7 is saddle point.
