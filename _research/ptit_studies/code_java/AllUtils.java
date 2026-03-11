
/**
 * AllUtils.java
 * 
 * Consolidated utility class for Java.
 * Includes: Number Theory, Arrays, Sorting, String operations, Matrix ops, and Fractions.
 */

import java.util.*;

public class AllUtils {

    // ============================================================================
    // NUMBER THEORY
    // ============================================================================

    public static boolean isPrime(int n) {
        if (n < 2)
            return false;
        for (int i = 2; i <= Math.sqrt(n); i++) {
            if (n % i == 0)
                return false;
        }
        return true;
    }

    public static long gcd(long a, long b) {
        while (b != 0) {
            long temp = b;
            b = a % b;
            a = temp;
        }
        return a;
    }

    public static long lcm(long a, long b) {
        if (a == 0 || b == 0)
            return 0;
        return Math.abs(a * b) / gcd(a, b);
    }

    public static long factorial(int n) {
        if (n <= 1)
            return 1;
        long res = 1;
        for (int i = 2; i <= n; i++)
            res *= i;
        return res;
    }

    public static int reverseNumber(int n) {
        int rev = 0;
        while (n > 0) {
            rev = rev * 10 + n % 10;
            n /= 10;
        }
        return rev;
    }

    public static boolean checkDigitSum(int n) {
        int sum = 0;
        int temp = n;
        while (temp > 0) {
            sum += temp % 10;
            temp /= 10;
        }
        return sum % 10 == 0;
    }

    public static int[] fiboArray(int n) {
        if (n <= 0)
            return new int[0];
        if (n == 1)
            return new int[] { 0 };
        int[] f = new int[n];
        f[0] = 0;
        f[1] = 1;
        for (int i = 2; i < n; i++) {
            f[i] = f[i - 1] + f[i - 2];
        }
        return f;
    }

    public static boolean[] sieveOfEratosthenes(int n) {
        boolean[] primes = new boolean[n + 1];
        Arrays.fill(primes, true);
        primes[0] = primes[1] = false;
        for (int i = 2; i * i <= n; i++) {
            if (primes[i]) {
                for (int j = i * i; j <= n; j += i)
                    primes[j] = false;
            }
        }
        return primes;
    }

    public static boolean isFibonacci(long n) {
        return isPerfectSquare(5 * n * n + 4) || isPerfectSquare(5 * n * n - 4);
    }

    private static boolean isPerfectSquare(long n) {
        long s = (long) Math.sqrt(n);
        return s * s == n;
    }

    // ============================================================================
    // STRINGS
    // ============================================================================

    public static String normalizeName(String s) {
        String[] words = s.trim().split("\\s+");
        StringBuilder sb = new StringBuilder();
        for (String word : words) {
            if (word.isEmpty())
                continue;
            sb.append(Character.toUpperCase(word.charAt(0)));
            sb.append(word.substring(1).toLowerCase());
            sb.append(" ");
        }
        return sb.toString().trim();
    }

    public static int countWords(String s) {
        if (s == null || s.isEmpty())
            return 0;
        String[] words = s.trim().split("\\s+");
        return words.length;
    }

    public static boolean isPalindrome(String s) {
        StringBuilder sb = new StringBuilder(s);
        return s.equals(sb.reverse().toString());
    }

    // ============================================================================
    // ARRAYS & SORTING
    // ============================================================================

    private static void swap(int[] arr, int i, int j) {
        int temp = arr[i];
        arr[i] = arr[j];
        arr[j] = temp;
    }

    public static void bubbleSort(int[] arr) {
        int n = arr.length;
        for (int i = 0; i < n - 1; i++) {
            for (int j = 0; j < n - i - 1; j++) {
                if (arr[j] > arr[j + 1]) {
                    swap(arr, j, j + 1);
                }
            }
        }
    }

    public static void selectionSort(int[] arr) {
        int n = arr.length;
        for (int i = 0; i < n - 1; i++) {
            int min_idx = i;
            for (int j = i + 1; j < n; j++)
                if (arr[j] < arr[min_idx])
                    min_idx = j;
            swap(arr, min_idx, i);
        }
    }

    public static void insertionSort(int[] arr) {
        int n = arr.length;
        for (int i = 1; i < n; ++i) {
            int key = arr[i];
            int j = i - 1;
            while (j >= 0 && arr[j] > key) {
                arr[j + 1] = arr[j];
                j = j - 1;
            }
            arr[j + 1] = key;
        }
    }

    public static void quickSort(int[] arr, int low, int high) {
        if (low < high) {
            int pi = partition(arr, low, high);
            quickSort(arr, low, pi - 1);
            quickSort(arr, pi + 1, high);
        }
    }

    private static int partition(int[] arr, int low, int high) {
        int pivot = arr[high];
        int i = (low - 1);
        for (int j = low; j < high; j++) {
            if (arr[j] < pivot) {
                i++;
                swap(arr, i, j);
            }
        }
        swap(arr, i + 1, high);
        return i + 1;
    }

    public static int linearSearch(int[] arr, int x) {
        for (int i = 0; i < arr.length; i++) {
            if (arr[i] == x)
                return i;
        }
        return -1;
    }

    public static int binarySearch(int[] arr, int x) {
        int l = 0, r = arr.length - 1;
        while (l <= r) {
            int m = l + (r - l) / 2;
            if (arr[m] == x)
                return m;
            if (arr[m] < x)
                l = m + 1;
            else
                r = m - 1;
        }
        return -1;
    }

    public static void printArray(int[] arr) {
        for (int i : arr)
            System.out.print(i + " ");
        System.out.println();
    }

    // ============================================================================
    // MATRIX OPERATIONS
    // ============================================================================

    public static void printMatrix(int[][] matrix) {
        for (int[] row : matrix) {
            for (int val : row) {
                System.out.printf("%3d ", val);
            }
            System.out.println();
        }
    }

    public static int[][] transposeMatrix(int[][] matrix) {
        int rows = matrix.length;
        int cols = matrix[0].length;
        int[][] res = new int[cols][rows];
        for (int i = 0; i < rows; i++) {
            for (int j = 0; j < cols; j++) {
                res[j][i] = matrix[i][j];
            }
        }
        return res;
    }

    public static int[][] multiplyMatrices(int[][] A, int[][] B) {
        int rowsA = A.length;
        int colsA = A[0].length;
        int rowsB = B.length;
        int colsB = B[0].length;
        if (colsA != rowsB)
            throw new IllegalArgumentException("Incompatible dimensions");

        int[][] C = new int[rowsA][colsB];
        for (int i = 0; i < rowsA; i++) {
            for (int j = 0; j < colsB; j++) {
                for (int k = 0; k < colsA; k++) {
                    C[i][j] += A[i][k] * B[k][j];
                }
            }
        }
        return C;
    }

    public static int[][] generateSpiralMatrix(int n) {
        int[][] matrix = new int[n][n];
        int val = 1;
        int top = 0, bottom = n - 1, left = 0, right = n - 1;

        while (top <= bottom && left <= right) {
            for (int i = left; i <= right; i++)
                matrix[top][i] = val++;
            top++;
            for (int i = top; i <= bottom; i++)
                matrix[i][right] = val++;
            right--;
            if (top <= bottom) {
                for (int i = right; i >= left; i--)
                    matrix[bottom][i] = val++;
                bottom--;
            }
            if (left <= right) {
                for (int i = bottom; i >= top; i--)
                    matrix[i][left] = val++;
                left++;
            }
        }
        return matrix;
    }

    // ============================================================================
    // FRACTIONS (Inner Class)
    // ============================================================================

    public static class Fraction {
        public long num, den;

        public Fraction(long num, long den) {
            if (den == 0)
                throw new IllegalArgumentException("Denominator zero");
            long common = gcd(Math.abs(num), Math.abs(den));
            this.num = num / common;
            this.den = den / common;
        }

        public Fraction add(Fraction other) {
            long newNum = this.num * other.den + other.num * this.den;
            long newDen = this.den * other.den;
            return new Fraction(newNum, newDen);
        }

        @Override
        public String toString() {
            return num + "/" + den;
        }
    }

    // ============================================================================
    // MAIN DEMO
    // ============================================================================

    public static void main(String[] args) {
        System.out.println("=== Java Utilities Demo ===\n");

        // Prime
        System.out.println("Is 17 prime? " + isPrime(17));

        // String
        String name = "  nguYen   vAn  a  ";
        System.out.println("Original: '" + name + "'");
        System.out.println("Normalized: '" + normalizeName(name) + "'");

        // Sorting
        int[] arr = { 64, 34, 25, 12, 22, 11, 90 };
        System.out.print("Unsorted: ");
        printArray(arr);

        bubbleSort(arr);
        System.out.print("Sorted:   ");
        printArray(arr);

        // Matrix
        int n = 4;
        System.out.println("\nSpiral Matrix 4x4:");
        printMatrix(generateSpiralMatrix(n));

        // Fraction
        Fraction f1 = new Fraction(1, 2);
        Fraction f2 = new Fraction(1, 3);
        System.out.println("\nFraction Sum: " + f1 + " + " + f2 + " = " + f1.add(f2));
    }
}
