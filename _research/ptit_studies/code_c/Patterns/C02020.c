/*
 * Filename: C02020.c
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
    int nga = n - 1;
    for (int i = 1; i <= n; i++)
    {
        int dem = 1;
        int ktra = 0;
        int j = 2;
        while (1)
        {
            if (dem <= nga)
            {
                printf("~"); // Print result
                dem++;
                continue;
            }
            if (dem == n && j == 2)
            {
                printf("%d", j); // Print result
                dem++;
                break;
            }
            if (dem == n)
            {
                printf("%d", j); // Print result
                ktra = 1;
                j -= 2;
                continue;
            }
            if (j == 1 && ktra == 1)
            {
                printf("1"); // Print result
                break;
            }
            if (ktra == 0)
            {
                printf("%d", j); // Print result
                j += 2;
                dem++;
                continue;
            }
            if (ktra == 1)
            {
                printf("%d", j); // Print result
                j -= 2;
                continue;
            }
        }
        printf("\n"); // Print result
        nga--;
    }
    return 0;
}