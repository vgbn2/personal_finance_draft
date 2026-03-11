/**
 * all_utils.c
 * 
 * A consolidated library of utility functions from the CodePtit studies.
 * Includes: Number Theory, Sorting, Arrays, and Matrix operations (including Spiral/Swirling).
 */

#include <stdio.h>
#include <math.h>
#include <stdbool.h>
#include <stdlib.h>

// ============================================================================
// NUMBER THEORY
// ============================================================================

// Check if a number is prime (from findprimearray.c)
int sumoprimefactor(int n){
    int sum = 0;
    for (int i = 2; i <=sqrt(n); i++) {
        while (n % i == 0) {
            sum += sumodigit(i);
            n /= i;
        }
    }
    if (n > 1) {
        sum += sumodigit(n);
    }
    return sum;
}
bool isPrime(int n) {
    if (n < 2) return false;
    for (int i = 2; i <= sqrt(n); i++) {
        if (n % i == 0) return false;
    }
    return true;
}

// Check if sum of digits is divisible by 10 (from C03001.c)
int checkDigitSum(int n) {
    int sum = 0;
    while (n > 0) {
        sum += n % 10;
        n /= 10;
    }
    return (sum % 10 == 0);
}

// Generate Fibonacci sequence up to n elements
void fiboArray(int n, int f[]) {
    f[0] = 0;
    f[1] = 1;
    for (int i = 2; i < n; i++)
        f[i] = f[i - 1] + f[i - 2];
}

// UCLN of two numbers
int gcd(int a, int b) {
    while (b != 0) {
        int temp = b;
        b = a % b;
        a = temp;
    }
    return a;
}

// BCNN of two numbers
int lcm(int a, int b) {
    long long res = (long long)a * b; // Use long long to prevent overflow
    return res / gcd(a, b);
}

// Factorial (Giai thua) - n!
long long factorial(int n) {
    if (n <= 1) return 1;
    long long result = 1;
    for (int i = 2; i <= n; i++)
        result *= i;
    return result;
}

// Check if n is a perfect square
bool isPerfectSquare(int n) {
    int s = (int)sqrt(n);
    return (s * s == n);
}

// Check if n is a Fibonacci number
bool isFibonacci(int n) {
    // A number is Fibonacci if one of (5*n^2 + 4) or (5*n^2 - 4) is a perfect square
    return isPerfectSquare(5 * n * n + 4) || isPerfectSquare(5 * n * n - 4);
}

// Reverse digits of a number
int reverseNumber(int n) {
    int rev = 0;
    while (n > 0) {
        rev = rev * 10 + n % 10;
        n /= 10;
    }
    return rev;
}

// Sieve of Eratosthenes - marks primes in array up to n
void sieveOfEratosthenes(int n, bool primes[]) {
    for (int i = 0; i <= n; i++) primes[i] = true;
    primes[0] = primes[1] = false;
    for (int i = 2; i * i <= n; i++) {
        if (primes[i]) {
            for (int j = i * i; j <= n; j += i)
                primes[j] = false;
        }
    }
}


// Count number of factors
int countFactors(int n) {
    int count = 0;
    for (int i = 1; i <= n/i; i++) {
        if (n % i == 0) {
            if (i * i == n) count++;
            else count += 2;
        }
    }
    return count;
}

// Print all factors of a number
void printFactors(int n) {
    for (int i = 1; i <= n; i++) {
        if (n % i == 0) {
            printf("%d ", i);
        }
    }
    printf("\n");
}

// ============================================================================
// STRINGS
// ============================================================================

#include <ctype.h>
#include <string.h>

void toLower(char *s) {
    for (int i = 0; s[i]; i++) s[i] = tolower(s[i]);
}

void toUpper(char *s) {
    for (int i = 0; s[i]; i++) s[i] = toupper(s[i]);
}

// Normalize name: "  nguYen   vAn  a  " -> "Nguyen Van A"
void normalizeName(char *s) {
    char res[1000] = "";
    char *token = strtok(s, " \t\n");
    while (token != NULL) {
        token[0] = toupper(token[0]);
        for (int i = 1; token[i]; i++) token[i] = tolower(token[i]);
        strcat(res, token);
        strcat(res, " ");
        token = strtok(NULL, " \t\n");
    }
    // Remove trailing space
    int len = strlen(res);
    if (len > 0) res[len - 1] = '\0';
    strcpy(s, res);
}

// Count words in a string
int countWords(char *s) {
    int count = 0;
    bool inWord = false;
    for (int i = 0; s[i]; i++) {
        if (s[i] != ' ' && s[i] != '\t' && s[i] != '\n') {
            if (!inWord) {
                inWord = true;
                count++;
            }
        } else {
            inWord = false;
        }
    }
    return count;
}

// ============================================================================
// STRUCTS & FRACTIONS
// ============================================================================

typedef struct {
    int tu;  // Numerator
    int mau; // Denominator
} Fraction;

Fraction simplifyFraction(Fraction f) {
    int common = gcd(abs(f.tu), abs(f.mau));
    f.tu /= common;
    f.mau /= common;
    return f;
}

Fraction addFractions(Fraction a, Fraction b) {
    Fraction res;
    res.mau = lcm(a.mau, b.mau);
    res.tu = a.tu * (res.mau / a.mau) + b.tu * (res.mau / b.mau);
    return simplifyFraction(res);
}

// ============================================================================
// SORTING & ARRAYS
// ============================================================================

void swap(int *a, int *b) {
    int temp = *a;
    *a = *b;
    *b = temp;
}

// Selection Sort (from sortarrays.c)
void selectionSort(int arr[], int n) {
    int min_idx;
    for (int i = 0; i < n - 1; i++) {
        min_idx = i;
        for (int j = i + 1; j < n; j++)
            if (arr[j] < arr[min_idx])
                min_idx = j;
        swap(&arr[min_idx], &arr[i]);
    }
}

// Bubble Sort (Standard implementation)
void bubbleSort(int arr[], int n) {
    for (int i = 0; i < n - 1; i++) {
        for (int j = 0; j < n - i - 1; j++) {
            if (arr[j] > arr[j + 1]) {
                swap(&arr[j], &arr[j + 1]);
            }
        }
    }
}

void printArray(int arr[], int n) {
    for (int i = 0; i < n; i++) {
        printf("%d ", arr[i]);
    }
    printf("\n");
}

// Min of two values
int min(int a, int b) {
    return (a < b) ? a : b;
}

// Max of two values
int max(int a, int b) {
    return (a > b) ? a : b;
}

// Insertion Sort
void insertionSort(int arr[], int n) {
    for (int i = 1; i < n; i++) {
        int key = arr[i];
        int j = i - 1;
        while (j >= 0 && arr[j] > key) {
            arr[j + 1] = arr[j];
            j--;
        }
        arr[j + 1] = key;
    }
}

// Quick Sort - Partition helper
int partition(int arr[], int low, int high) {
    int pivot = arr[high];
    int i = low - 1;
    for (int j = low; j < high; j++) {
        if (arr[j] < pivot) {
            i++;
            swap(&arr[i], &arr[j]);
        }
    }
    swap(&arr[i + 1], &arr[high]);
    return i + 1;
}

// Quick Sort
void quickSort(int arr[], int low, int high) {
    if (low < high) {
        int pi = partition(arr, low, high);
        quickSort(arr, low, pi - 1);
        quickSort(arr, pi + 1, high);
    }
}

// Linear Search - returns index or -1 if not found
int linearSearch(int arr[], int n, int x) {
    for (int i = 0; i < n; i++) {
        if (arr[i] == x) return i;
    }
    return -1;
}

// Binary Search (requires sorted array) - returns index or -1 if not found
int binarySearch(int arr[], int n, int x) {
    int left = 0, right = n - 1;
    while (left <= right) {
        int mid = left + (right - left) / 2;
        if (arr[mid] == x) return mid;
        if (arr[mid] < x) left = mid + 1;
        else right = mid - 1;
    }
    return -1;
}

// ============================================================================
// MATRIX OPERATIONS
// ============================================================================

void printMatrix(int n, int matrix[100][100]) {
    for (int i = 0; i < n; i++) {
        for (int j = 0; j < n; j++) {
            printf("%d ", matrix[i][j]);
        }
        printf("\n");
    }
}

// Transpose Matrix (swap rows and columns)
void transposeMatrix(int n, int matrix[100][100], int result[100][100]) {
    for (int i = 0; i < n; i++) {
        for (int j = 0; j < n; j++) {
            result[j][i] = matrix[i][j];
        }
    }
}

// Multiply Matrices: C = A * B (all n x n)
void multiplyMatrices(int n, int A[100][100], int B[100][100], int C[100][100]) {
    for (int i = 0; i < n; i++) {
        for (int j = 0; j < n; j++) {
            C[i][j] = 0;
            for (int k = 0; k < n; k++) {
                C[i][j] += A[i][k] * B[k][j];
            }
        }
    }
}

// Swirling/Spiral Matrix Logic (Extracted from C05020.c)
// Fills matrix 'a' of size n*n with values from array 'values' in a spiral order.
// Uses geographical directions: 
//   - bac (North/Top): 0 -> n-1
//   - nam (South/Bottom): n-1 -> 0
//   - tay (West/Left): 0 -> n-1
//   - dong (East/Right): n-1 -> 0
void generateSpiralMatrix(int n, int values[], int a[100][100]) {
    int dong = n - 1, tay = 0, nam = n - 1, bac = 0, dem = 0;
    while (dem < n * n) {
        // Hang tren (Bac - Top): Tay -> Dong
        for (int i = tay; i <= dong; i++)
            a[bac][i] = values[dem++];//bac-i
        bac++;
        
        // Cot phai (Dong - Right): Bac -> Nam
        for (int i = bac; i <= nam; i++)
            a[i][dong] = values[dem++];//i-dong
        dong--;
        
        if (dem < n * n) {
            // Hang duoi (Nam - Bottom): Dong -> Tay
            for (int i = dong; i >= tay; i--)
                a[nam][i] = values[dem++];//nam-i
            nam--;
        }
        
        if (dem < n * n) {
            // Cot trai (Tay - Left): Nam -> Bac
            for (int i = nam; i >= bac; i--)
                a[i][tay] = values[dem++];//i-tay
            tay++;
        }
    }
    //neu la 0:++
    //neu la n-1:--
}

// ============================================================================
// MAIN DEMO
// ============================================================================
int main() {
    printf("=== C Utilities Demo ===\n\n");

    // 1. Prime Test
    int p = 17;
    printf("Is %d prime? %s\n", p, isPrime(p) ? "Yes" : "No");

    // 2. Sorting Test
    int arr[] = {64, 34, 25, 12, 22, 11, 90};
    int n_arr = 7;
    printf("\nUnsorted Array: ");
    printArray(arr, n_arr);
    
    bubbleSort(arr, n_arr);
    printf("Sorted Array:   ");
    printArray(arr, n_arr);

    // 3. Spiral Matrix Test
    int n = 4;
    printf("\nSpiral Matrix (%dx%d) with Fibonacci numbers:\n", n, n);
    
    int fib[100];
    fiboArray(n * n, fib); // Generate enough fib numbers
    
    int matrix[100][100];
    generateSpiralMatrix(n, fib, matrix);
    printMatrix(n, matrix);

    // 4. String Test
    char name[] = "  nguYen   vAn  a  ";
    printf("\nOriginal Name: '%s'\n", name);
    normalizeName(name);
    printf("Normalized Name: '%s'\n", name);

    // 5. Fraction Test
    Fraction f1 = {1, 2};
    Fraction f2 = {1, 3};
    Fraction sum = addFractions(f1, f2);
    printf("\nFraction Sum: %d/%d + %d/%d = %d/%d\n", f1.tu, f1.mau, f2.tu, f2.mau, sum.tu, sum.mau);


    // 6. Factors Test
    int num = 24;
    printf("\nFactors of %d: ", num);
    printFactors(num);
    printf("Number of factors: %d\n", countFactors(num));

    return 0;

}
