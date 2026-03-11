# Test 3 (Advanced)

## 1. Number Theory: Goldbach Conjecture
Verify **Goldbach's Conjecture** for an even number N > 2.
For a given even N, print ALL pairs of primes (p, q) such that p + q = N and p <= q.

- **Input**: Even integer N (N < 10000).
- **Output**: Key-value pairs of primes summing to N.
- **Test Cases**: 5 different even numbers.
- **Example**:
    - Input: `20`
    - Output: `3 17`, `7 13`

## 2. Strings: Count Distinct Words
Count the number of **distinct words** in a string, ignoring case sensitivity.

- **Input**: A string S.
- **Output**: Integer count of distinct words.
- **Example**:
    - Input: `"Hello world HELLO World"`
    - Output: `2` (hello, world)

## 3. Structs: Student Management
Manage a list of `Student`s (Name, GPA, ID).
Write a function to filter students with GPA >= X and sort them by Name alphabetically.

- **Input**:
    - N students (ID, Name, GPA).
    - Threshold X.
- **Output**: Details of students passing criteria, sorted by name.
- **Example**:
    - Students: `1 A 3.5`, `2 B 2.0`, `3 C 3.8`. X=3.0.
    - Output:
      ```
      1 A 3.5
      3 C 3.8
      ```

## 4. Sorting: Merge Two Sorted Arrays
Given two sorted arrays A (size N) and B (size M), **merge** them into a single sorted array C in linear time O(N+M).
Do NOT concatenate and resort.

- **Input**: Array A sorted, Array B sorted.
- **Output**: Merged Array C sorted.
- **Example**:
    - A: `1 3 5`
    - B: `2 4 6`
    - C: `1 2 3 4 5 6`

## 5. Matrix: Largest Square of 1s
Find the **largest square submatrix** consisting entirely of 1s in a binary matrix. Output the size of the square.

- **Input**: NxM binary matrix.
- **Output**: Size of largest square (e.g., 2 for 2x2).
- **Example**:
    - Input:
      ```
      0 1 1
      1 1 1
      0 1 1
      ```
    - Output: `2` (The 2x2 square of 1s).
