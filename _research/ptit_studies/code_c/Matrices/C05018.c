/*
 * Filename: C05018.c
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
    int a[25][25];
    int gt = n * n, cot = n, hang = n, d = 1;
    while (d <= n / 2 + 1)
    {
        for (int i = d; i <= cot; i++)
            a[d][i] = gt--;
        for (int i = d + 1; i <= hang; i++)
            a[i][cot] = gt--;
        for (int i = cot - 1; i >= d; i--)
            a[hang][i] = gt--;
        for (int i = hang - 1; i > d; i--)
            a[i][d] = gt--;
        d++;
        hang--;
        cot--;
    }
    printf("Test %d:\n", t); // Print result
    for (int i = 1; i <= n; i++)
    {
        for (int j = 1; j <= n; j++)
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