# Test 5 (Advanced)

## 1. Number Theory: Trailing Zeros in N!
Count the number of **trailing zeros** in N! (N factorial) without calculating N!.
Hint: Count factors of 5.

- **Input**: Integer N.
- **Output**: Count of zeros.
- **Test Cases**: 5-10 inputs.
- **Example**:
    - Input: `20`
    - Output: `4` (20! has 4 trailing zeros).

## 2. Strings: Longest Substring Without Repeats
Find the length of the **longest substring without repeating characters**.

- **Input**: A string S.
- **Output**: Integer length.
- **Example**:
    - Input: `"abcabcbb"`
    - Output: `3` ("abc").

## 3. Structs: Profit Calculation
Manage a list of `Item`s (Name, Buying Price, Selling Price).
Calculate Profit per item and sort items by **Profit** in descending order.

- **Input**: N items with prices.
- **Output**: Items sorted by profit.
- **Example**:
    - `ItemA 10 15` (Profit 5)
    - `ItemB 20 30` (Profit 10)
    - Output: `ItemB`, `ItemA`.

## 4. Sorting: Quick Sort Optimization
Implement **Quick Sort** with pivot as median-of-three to optimize.

- **Input**: N integers.
- **Output**: Sorted array.
- **Test Cases**: 10 random arrays + sorted + reverse sorted arrays.

## 5. Matrix: Matrix * Transpose
Given matrix A, calculate the product **A * Transpose(A)**.
If A is NxM, result will be NxN symmetric matrix.

- **Input**: NxM Matrix A.
- **Output**: Resulting NxN Matrix.
- **Example**:
    - Input: `1 2` (1x2 matrix)
    - Output: `5` ( [1 2] * [1; 2] = 1*1 + 2*2 = 5).
