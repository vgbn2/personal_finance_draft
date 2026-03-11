/*
 * Filename: C05012.c
 * Description: C Program using functions: solve
 * 
 * Test Case Example:
 * Input:
 *   [Insert Example Input Here]
 * Output:
 *   [Insert Example Output Here]
 */

// Import standard libraries
#include <stdio.h>

void solve(int t)
{
    int n;
    scanf("%d", &n); // Read input
    int a[20][20] = {0};
    int b[20][20];
    for (int i = 1; i <= n; i++)
        for (int j = 1; j <= i; j++)
            a[i][j] = j;
    for (int j = 1; j <= n; j++)
        for (int i = 1; i <= n; i++)
            b[j][i] = a[i][j];
    printf("Test %d:\n", t); // Print result
    for (int i = 1; i <= n; i++)
    {
        for (int j = 1; j <= n; j++)
        {
            int s = 0;
            for (int k = 1; k <= n; k++)
                s += a[i][k] * b[k][j];
            printf("%d ", s); // Print result
        }
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