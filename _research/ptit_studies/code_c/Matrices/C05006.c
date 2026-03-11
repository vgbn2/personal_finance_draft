/*
 * Filename: C05006.c
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
    int m, n;
    scanf("%d%d", &m, &n); // Read input
    int t[50][50];
    for (int i = 0; i < m; i++)
        for (int j = 0; j < n; j++)
            scanf("%d", &t[i][j]); // Read input
    int a, b;
    scanf("%d%d", &a, &b); // Read input
    for (int i = 0; i < m; i++)
    {
        for (int j = 0; j < n; j++)
        {
            if (i == a - 1)
                printf("%d ", t[b - 1][j]); // Print result
            else if (i == b - 1)
                printf("%d ", t[a - 1][j]); // Print result
            else
                printf("%d ", t[i][j]); // Print result
        }
        printf("\n"); // Print result
    }
    return 0;
}