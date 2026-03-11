/*
 * Filename: C05009.c
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
    int a[50][50];
    for (int i = 0; i < n; i++)
        for (int j = 0; j < n; j++)
            scanf("%d", &a[i][j]); // Read input

    for (int i = 0; i < n; i++)
    {
        for (int j = 0; j < n; j++)
        {
            if (i == j)
            {
                int temp = a[i][j];
                a[i][j] = a[i][n - 1 - j];
                a[i][n - 1 - j] = temp;
            }
        }
    }

    for (int i = 0; i < n; i++)
    {
        for (int j = 0; j < n; j++)
            printf("%d ", a[i][j]); // Print result
        printf("\n"); // Print result
    }
    return 0;
}
