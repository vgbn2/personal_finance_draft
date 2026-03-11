/*
 * Filename: C05008.c
 * Description: Calculates sums using functions: solve
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
    int m, n;
    scanf("%d%d", &m, &n); // Read input
    int a[50][50];
    int sRow = 0, sColumn = 0;
    int r, c;
    for (int i = 0; i < m; i++)
    {
        int sum = 0;
        for (int j = 0; j < n; j++)
        {
            scanf("%d", &a[i][j]); // Read input
            sum += a[i][j];
        }
        if (sum > sRow)
        {
            sRow = sum;
            r = i;
        }
    }
    for (int j = 0; j < n; j++)
    {
        int sum = 0;
        for (int i = 0; i < m; i++)
        {
            if (i == r)
                continue;
            sum += a[i][j];
        }
        if (sum > sColumn)
        {
            sColumn = sum;
            c = j;
        }
    }
    printf("Test %d:\n", t); // Print result
    for (int i = 0; i < m; i++)
    {
        for (int j = 0; j < n; j++)
        {
            if (i == r || j == c)
                continue;
            printf("%d ", a[i][j]); // Print result
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
    {
        solve(t);
    }
    return 0;
}