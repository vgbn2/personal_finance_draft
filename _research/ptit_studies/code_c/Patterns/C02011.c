/*
 * Filename: C02011.c
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
    int a, b;
    scanf("%d %d", &a, &b); // Read input
    for (int i = 1; i <= a; i++)
    {
        int j = i;
        int ktra = 0, dem = 0;
        while (dem < b)
        {
            if (j >= b)
            {
                printf("%d", j); // Print result
                ktra = 1;
                dem++;
                j--;
                continue;
            }
            if (ktra == 0)
            {
                printf("%d", j); // Print result
                j++;
                dem++;
                continue;
            }
            if (ktra == 1)
            {
                printf("%d", j); // Print result
                j--;
                dem++;
                continue;
            }
        }
        printf("\n"); // Print result
    }
    return 0;
}