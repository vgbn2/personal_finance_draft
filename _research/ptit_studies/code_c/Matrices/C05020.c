/*
 * Filename: C05020.c
 * Description: C Program using functions: FiboArray
 * 
 * Test Case Example:
 * Input:
 *   [Insert Example Input Here]
 * Output:
 *   [Insert Example Output Here]
 */

// Import standard libraries
#include <stdio.h>

void FiboArray(int n, int f[100])
{
    f[0] = 0;
    f[1] = 1;
    for (int i = 2; i < n * n; i++)
        f[i] = f[i - 1] + f[i - 2];
}

// Entry point
int main()
{
    int n;
    scanf("%d", &n); // Read input
    int f[100];
    FiboArray(n, f);
    int a[10][10], d = 0, hang = n - 1, cot = n - 1, gt = 0;
    while (d <= n / 2)
    {
        for (int i = d; i <= cot; i++)
            a[d][i] = f[gt++];
        for (int i = d + 1; i <= hang; i++)
            a[i][cot] = f[gt++];
        for (int i = cot - 1; i >= d; i--)
            a[hang][i] = f[gt++];
        for (int i = hang - 1; i > d; i--)
            a[i][d] = f[gt++];
        d++;
        hang--;
        cot--;
    }
    for (int i = 0; i < n; i++)
    {
        for (int j = 0; j < n; j++)
            printf("%d ", a[i][j]); // Print result
        printf("\n"); // Print result
    }
    return 0;
}