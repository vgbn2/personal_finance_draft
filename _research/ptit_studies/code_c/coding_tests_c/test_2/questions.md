# Test 2 (Advanced)

## 1. Number Theory: Super Primes
Write a function to list all **Super Primes** less than N.
A Super Prime is a prime number such that when you repeatedly delete its last digit, the remaining number is also prime (e.g., 373 -> 37 -> 3, all prime).

- **Input**: Integer N (N < 100000).
- **Output**: Space-separated list of Super Primes < N.
- **Test Cases**: Run against 5 inputs.
- **Example**:
    - Input: `50`
    - Output: `2 3 5 7 23 29 31 37`

## 2. Strings: Longest Palindromic Word
Write a function to find the **longest palindromic word** in a string.
A palindrome reads the same forwards and backwards.

- **Input**: A string S.
- **Output**: The longest palindrome found. If multiple, print the first one found.
- **Example**:
    - Input: `"level racecar madam hello"`
    - Output: `"racecar"`

## 3. Structs: Polynomial Operations
Define a `Polynomial` struct (array of coefficients and degree). Write functions to **add** and **multiply** two polynomials.
Polynomial: P(x) = a0*x^0 + a1*x^1 + ... + an*x^n

- **Input**:
    1.  Degree N and N+1 coefficients for P(x).
    2.  Degree M and M+1 coefficients for Q(x).
- **Output**: Resulting coefficients for P+Q and P*Q.
- **Example**:
    - Input P: `2` `1 2 3` (3x^2 + 2x + 1)
    - Input Q: `1` `4 5` (5x + 4)
    - Sum: `5 7 3` (3x^2 + 7x + 5)
    - Product: `4 13 22 15` (15x^3 + 22x^2 + 13x + 4)

## 4. Sorting: Sort by Sum of Digits
Sort an array of numbers based on the **sum of their digits** (ascending).
If sums are equal, the smaller number comes first.

- **Input**: Integer N, followed by N integers.
- **Output**: Sorted array.
- **Example**:
    - Input: `13 22 17 9 20`
    - Output: `20 13 22 17 9`
    - (Sums: 20->2, 13->4, 22->4, 17->8, 9->9. Since 13 and 22 have sum 4, 13 < 22).

## 5. Matrix: Rotate 90 Degrees
Write a function to **rotate** an NxN matrix 90 degrees clockwise in-place.

- **Input**: Integer N, followed by NxN elements.
- **Output**: Rotated matrix.
- **Example**:
    - Input:
      ```
      1 2
      3 4
      ```
    - Output:
      ```
      3 1
      4 2
      ```
