/*
 * Filename: C03028.c
 * Description: C Program using functions: factorial, pascal
 * 
 * Test Case Example:
 * Input:
 *   [Insert Example Input Here]
 * Output:
 *   [Insert Example Output Here]
 */

// Import standard libraries
#include <stdio.h>

int factorial(int n)
{
    int f = 1;
    for (int i = n; i >= 1; i--)
        f *= i;
    return f;
}

int pascal(int n, int k)
{
    return factorial(n) / (factorial(k) * factorial(n - k));
}

// Entry point
int main()
{
    int n;
    scanf("%d", &n); // Read input
    for (int i = 0; i < n; i++)
    {
        for (int j = 0; j <= i; j++)
            printf("%d ", pascal(i, j)); // Print result
        printf("\n"); // Print result
    }
    return 0;
}