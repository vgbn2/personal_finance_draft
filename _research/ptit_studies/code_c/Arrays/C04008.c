/*
 * Filename: C04008.c
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
    int m, n, p;
    scanf("%d%d%d", &m, &n, &p); // Read input
    int a[100], b[100];
    for (int i = 0; i < m; i++)
        scanf("%d", &a[i]); // Read input
    for (int i = 0; i < n; i++)
        scanf("%d", &b[i]); // Read input
    printf("Test %d:\n", t); // Print result
    for (int i = 0; i < m + n; i++)
    {
        if (i < p)
            printf("%d ", a[i]); // Print result
        else if (i >= p && i < p + n)
            printf("%d ", b[i - p]); // Print result
        else
            printf("%d ", a[i - n]); // Print result
    }
    printf("\n"); // Print result
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