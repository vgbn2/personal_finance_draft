/*
 * Filename: C02027.c
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
    int cot = 1;
    int dem = 96;
    for (int i = 1; i <= n; i++)
    {
        if (i % 2 == 1)
        {
            int a = dem + 1;
            for (int j = 1; j <= cot; j++)
            {
                printf("%c ", a); // Print result
                a++;
                dem++;
            }
        }
        if (i % 2 == 0)
        {
            int a = dem + i;
            for (int j = 1; j <= cot; j++)
            {
                printf("%c ", a); // Print result
                a--;
                dem++;
            }
        }
        cot++;
        printf("\n"); // Print result
    }
    return 0;
}