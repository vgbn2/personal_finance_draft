# Test 1 (Advanced)

## 1. Number Theory: Smith Numbers
Write a function to find all **Smith Numbers** less than N.
A Smith Number is a composite number whose sum of digits equals the sum of the digits of its prime factors.
*Example*: 666 (Sum of digits: 6+6+6=18. Prime factors: 2, 3, 3, 37. Sum of factor digits: 2+3+3+(3+7)=18).

- **Input**: Integer N (N < 100000).
- **Output**: Space-separated list of Smith Numbers < N.
- **Test Cases**: Run against 5 inputs (e.g., 50, 100, 500, 1000, 10000).
- **Example**:
    - Input: `50`
    - Output: `4 22 27`

## 2. Strings: Longest Word
Write a function to find the **longest word** in a string.
If multiple words have the same maximum length, return the one that appears first.

- **Input**: A string S containing words separated by spaces.
- **Output**: The longest word and its length.
- **Test Cases**: Run against 5 inputs.
- **Example**:
    - Input: `"The quick brown fox jumps over the lazy dog"`
    - Output: `"quick 5"` (or "brown", "jumps" depending on logic, but prompt says "appears first" so "quick") 

## 3. Structs: Sort Fractions
Define a `Fraction` struct. Write a function to sort an array of `Fraction`s in ascending order.
Simplify fractions before sorting/printing.

- **Input**: Integer N, followed by N pairs of integers (numerator denominator).
- **Output**: Sorted list of simplified fractions.
- **Test Cases**: Run against 5 inputs.
- **Example**:
    - Input: `3` `1 2` `3 4` `1 3`
    - Output: `1/3 1/2 3/4`

## 4. Sorting: Frequency Sort
Sort an array of integers based on the **frequency** of elements.
Elements with higher frequency come first. If frequencies are the same, the smaller element comes first.

- **Input**: Integer N, followed by N integers.
- **Output**: Sorted array.
- **Test Cases**: Run against 10 random arrays.
- **Example**:
    - Input: `8` `5 5 4 6 4 4 5 1`
    - Output: `4 4 4 5 5 5 1 6` (Since 4 and 5 both appear 3 times, 4 comes before 5. 1 and 6 appear once).

## 5. Matrix: Spiral Primes
Write a function to fill a spiral matrix of size NxN with the first N*N **Prime Numbers**.

- **Input**: Integer N (N <= 20).
- **Output**: NxN matrix filled with primes spirally.
- **Test Cases**: Run for N = 3, 4, 5.
- **Example**:
    - Input: `3`
    - Output:
      ```
      2  3  5
      19 23 7
      17 13 11
      ```
