"""
all_utils.py

A consolidated library of utility functions for Python.
Includes: Number Theory, Strings, Matrix Operations.
"""

import math

# ============================================================================
# NUMBER THEORY
# ============================================================================

def is_prime(n):
    """Check if n is prime."""
    if n < 2: return False
    for i in range(2, int(math.isqrt(n)) + 1):
        if n % i == 0: return False
    return True

def gcd(a, b):
    """Greatest Common Divisor."""
    return math.gcd(a, b)

def lcm(a, b):
    """Least Common Multiple."""
    return abs(a * b) // math.gcd(a, b)

def sieve_of_eratosthenes(n):
    """Generate list of primes up to n."""
    primes = [True] * (n + 1)
    primes[0] = primes[1] = False
    for i in range(2, int(math.isqrt(n)) + 1):
        if primes[i]:
            for j in range(i * i, n + 1, i):
                primes[j] = False
    return [i for i, is_prime in enumerate(primes) if is_prime]

def check_digit_sum(n):
    """Check if sum of digits is divisible by 10."""
    return sum(int(d) for d in str(n)) % 10 == 0

def factorial(n):
    """Calculate n!"""
    if n <= 1: return 1
    res = 1
    for i in range(2, n + 1):
        res *= i
    return res

def reverse_number(n):
    """Reverse digits of a number."""
    return int(str(n)[::-1])

def fibo_array(n):
    """Generate first n Fibonacci numbers."""
    if n <= 0: return []
    if n == 1: return [0]
    fib = [0, 1]
    while len(fib) < n:
        fib.append(fib[-1] + fib[-2])
    return fib

def is_fibonacci(n):
    """Check if n is a Fibonacci number based on perfect square property."""
    def is_perfect_square(x):
        s = int(math.isqrt(x))
        return s * s == x
    return is_perfect_square(5 * n * n + 4) or is_perfect_square(5 * n * n - 4)

# ============================================================================
# STRINGS
# ============================================================================

def normalize_name(s):
    """Normalize name string: '  nguYen   vAn  a  ' -> 'Nguyen Van A'."""
    return ' '.join(word.capitalize() for word in s.split())

def count_words(s):
    """Count words in a string."""
    return len(s.split())

def is_palindrome(s):
    """Check if string is palindrome."""
    return s == s[::-1]

# ============================================================================
# SORTING & ARRAYS
# ============================================================================

def bubble_sort(arr):
    n = len(arr)
    for i in range(n - 1):
        for j in range(n - 1 - i):
            if arr[j] > arr[j + 1]:
                arr[j], arr[j + 1] = arr[j + 1], arr[j]

def selection_sort(arr):
    n = len(arr)
    for i in range(n - 1):
        nb = i
        for j in range(i + 1, n):
            if arr[j] < arr[nb]:
                nb = j
        arr[i], arr[nb] = arr[nb], arr[i]

def insertion_sort(arr):
    for i in range(1, len(arr)):
        key = arr[i]
        j = i - 1
        while j >= 0 and key < arr[j]:
            arr[j + 1] = arr[j]
            j -= 1
        arr[j + 1] = key

def binary_search(arr, x):
    """Return index of x in sorted arr, or -1."""
    import bisect
    i = bisect.bisect_left(arr, x)
    if i != len(arr) and arr[i] == x:
        return i
    return -1

# ============================================================================
# MATRICES
# ============================================================================

def print_matrix(matrix):
    """Print 2D matrix."""
    for row in matrix:
        print(*(f"{x:3d}" for x in row)) # Formatted print

def transpose_matrix(matrix):
    """Return transposed matrix."""
    return [list(row) for row in zip(*matrix)]

def multiply_matrices(A, B):
    """Multiply two matrices A and B."""
    rows_A = len(A)
    cols_A = len(A[0])
    rows_B = len(B)
    cols_B = len(B[0])

    if cols_A != rows_B:
        raise ValueError("Cannot multiply matrices: dimensions incompatible.")

    C = [[0 for _ in range(cols_B)] for _ in range(rows_A)]
    for i in range(rows_A):
        for j in range(cols_B):
            for k in range(cols_A):
                C[i][j] += A[i][k] * B[k][j]
    return C

def generate_spiral_matrix(n):
    """Generate n x n spiral matrix with values 1 to n*n."""
    matrix = [[0] * n for _ in range(n)]
    left, right, top, bottom = 0, n - 1, 0, n - 1
    val = 1
    
    while left <= right and top <= bottom:
        for i in range(left, right + 1):
            matrix[top][i] = val
            val += 1
        top += 1
        
        for i in range(top, bottom + 1):
            matrix[i][right] = val
            val += 1
        right -= 1
        
        if top <= bottom:
            for i in range(right, left - 1, -1):
                matrix[bottom][i] = val
                val += 1
            bottom -= 1
            
        if left <= right:
            for i in range(bottom, top - 1, -1):
                matrix[i][left] = val
                val += 1
            left += 1
            
    return matrix

# ============================================================================
# FRACTIONS
# ============================================================================

class Fraction:
    def __init__(self, num, den):
        if den == 0: raise ValueError("Denominator cannot be zero")
        common = math.gcd(num, den)
        self.num = num // common
        self.den = den // common
    
    def __add__(self, other):
        new_num = self.num * other.den + other.num * self.den
        new_den = self.den * other.den
        return Fraction(new_num, new_den)
    
    def __str__(self):
        return f"{self.num}/{self.den}"

# ============================================================================
# MAIN DEMO
# ============================================================================

if __name__ == "__main__":
    print("=== Python Utilities Demo ===")
    
    # Primes
    print(f"\nIs 17 prime? {is_prime(17)}")
    print(f"Primes up to 20: {sieve_of_eratosthenes(20)}")
    
    # Number Theory
    print(f"Factorial(5): {factorial(5)}")
    
    # Strings
    name = "  nguYen   vAn  a  "
    print(f"\nOriginal: '{name}'")
    print(f"Normalized: '{normalize_name(name)}'")
    
    # Sorting
    arr = [64, 34, 25, 12, 22, 11, 90]
    print(f"\nUnsorted: {arr}")
    bubble_sort(arr)
    print(f"Sorted:   {arr}")

    # Matrices
    n = 4
    print(f"\nSpiral Matrix {n}x{n}:")
    spiral = generate_spiral_matrix(n)
    print_matrix(spiral)
    
    # Fractions
    f1 = Fraction(1, 2)
    f2 = Fraction(1, 3)
    print(f"\nFraction Sum: {f1} + {f2} = {f1 + f2}")
