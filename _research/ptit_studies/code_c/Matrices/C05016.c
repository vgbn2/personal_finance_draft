/*
 * Filename: C05016.c
 * Description: C Program
 * 
 * Test Case Example:
 * Input:
 *   [Insert Example Input Here]
 * Output:
 *   [Insert Example Output Here]
 */

// Import standard libraries
#include <stdio.h>

// Entry point
int main()
{
    int n;
    scanf("%d", &n); // Read input
    int gt = 1, hang = n - 1, cot = n - 1, i, d, a[101][101];
    while (d <= n / 2)
    {
        for (i = d; i <= cot; i++)
            a[d][i] = gt++;
        for (i = d + 1; i <= hang; i++)
            a[i][cot] = gt++;
        for (i = cot - 1; i >= d; i--)
            a[hang][i] = gt++;
        for (i = hang - 1; i > d; i--)
            a[i][d] = gt++;
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