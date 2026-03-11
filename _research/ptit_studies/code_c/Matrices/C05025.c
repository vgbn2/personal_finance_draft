/*
 * Filename: C05025.c
 * Description: C Program using functions: swap, solve
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

void solve(int t)
{
    int n, m;
    scanf("%d %d", &n, &m); // Read input
    int a[n][m];
    for (int i = 0; i < n; i++)
        for (int j = 0; j < m; j++)
            scanf("%d", &a[i][j]); // Read input
    for (int i1 = 0; i1 < n; i1++)
        for (int j1 = 0; j1 < m; j1++)
            for (int i2 = i1; i2 < n; i2++)
                for (int j2 = j1; j2 < m; j2++)
                    if (a[i1][j1] > a[i2][j2])
                        swap(&a[i1][j1], &a[i2][j2]);
    printf("Test %d:\n", t); // Print result
    for (int i = 0; i < n; i++)
    {
        for (int j = 0; j < m; j++)
            printf("%d ", a[i][j]); // Print result
        printf("\n"); // Print result
    }
}

// Entry point
int main()
{
    int T;
    scanf("%d", &T); // Read input
    for (int t = 1; t <= T; t++)
        solve(t);
    return 0;
}