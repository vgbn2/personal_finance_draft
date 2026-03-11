/*
 * Filename: C05011.c
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
    int n, m;
    scanf("%d %d", &n, &m); // Read input
    int a[n][m];
    int b[m][n]; // Ma trận chuyển vị
    for (int i = 0; i < n; i++)
        for (int j = 0; j < m; j++)
            scanf("%d", &a[i][j]); // Read input
    for (int j = 0; j < m; j++)
        for (int i = 0; i < n; i++)
            b[j][i] = a[i][j];
    printf("Test %d:\n", t); // Print result
    for (int i = 0; i < n; i++)
    {
        for (int j = 0; j < n; j++)
        {
            int s = 0;
            for (int k = 0; k < m; k++)
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