/*
 * Filename: C05005.c
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
    int T;
    scanf("%d", &T); // Read input
    for (int t = 1; t <= T; t++)
    {
        int m, n;
        scanf("%d%d", &m, &n); // Read input
        int a[m][n];
        for (int i = 0; i < m; i++)
            for (int j = 0; j < n; j++)
                scanf("%d", &a[i][j]); // Read input
        printf("Test %d:\n", t); // Print result
        for (int i = 1; i < m; i++)
        {
            for (int j = 1; j < n; j++)
                printf("%d ", a[i][j]); // Print result
            printf("\n"); // Print result
        }
    }
    return 0;
}