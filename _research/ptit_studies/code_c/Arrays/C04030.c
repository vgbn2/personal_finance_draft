/*
 * Filename: C04030.c
 * Description: C Program using functions: swap, solveA, solveB
 * 
 * Test Case Example:
 * Input:
 *   [Insert Example Input Here]
 * Output:
 *   [Insert Example Output Here]
 */

// Import standard libraries
#include <stdio.h>

void swap(int *a, int *b)
{
    int tmp = *a;
    *a = *b;
    *b = tmp;
}

void solveA(int a[101], int n)
{
    for (int i = 0; i < n; i++)
        scanf("%d", &a[i]); // Read input
    for (int i = 0; i < n; i++)
        for (int j = i + 1; j < n; j++)
            if (a[j] < a[i])
                swap(&a[i], &a[j]);
}

void solveB(int b[101], int n)
{
    for (int i = 0; i < n; i++)
        scanf("%d", &b[i]); // Read input
    for (int i = 0; i < n; i++)
        for (int j = i + 1; j < n; j++)
            if (b[j] > b[i])
                swap(&b[i], &b[j]);
}

// Entry point
int main()
{
    int T;
    scanf("%d", &T); // Read input
    for (int t = 1; t <= T; t++)
    {
        int n;
        scanf("%d", &n); // Read input
        int a[101], b[101];
        solveA(a, n);
        solveB(b, n);
        printf("Test %d:\n", t); // Print result
        for (int i = 0; i < n; i++)
            printf("%d %d ", a[i], b[i]); // Print result
        printf("\n"); // Print result
    }
    return 0;
}