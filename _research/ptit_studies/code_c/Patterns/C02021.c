/*
 * Filename: C02021.c
 * Description: C Program
 * 
 * Test Case Example:
 * Input:
 *   [Insert Example Input Here]
 * Output:
 *   [Insert Example Output Here]
 */

// Import standard libraries
#include "stdio.h"

// Entry point
int main()
{
    int n;
    scanf("%d", &n); // Read input
    int a[100][100];
    int chantren = 1;
    int chanphai = 1;
    int size = 1;
    for (int j = 1; j <= chanphai, j <= n; j++)
    {
        for (int i = 1; i >= chantren, i <= n; i++)
        {
            if (i >= chantren && j <= chanphai)
            {
                a[i][j] = size;
                size++;
            }
        }
        chanphai++;
        chantren++;
    }
    chanphai = 1;
    for (int i = 1; i <= n; i++)
    {
        for (int j = 1; j <= chanphai; j++)
        {
            printf("%d ", a[i][j]); // Print result
        }
        printf("\n"); // Print result
        chanphai++;
    }
    return 0;
}