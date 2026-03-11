/*
 * Filename: C02017.c
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
    int le = 3;
    int n;
    scanf("%d", &n); // Read input
    printf("1\n"); // Print result
    for (int i = 2; i <= n; i++)
    {
        int j = 1;
        int ktra = 0;
        while (1)
        {
            if (j <= 1 && ktra == 1)
            {
                printf("1"); // Print result
                break;
            }
            if (j == le && ktra == 0)
            {
                printf("%d", j); // Print result
                ktra = 1;
                j -= 2;
                continue;
            }
            if (ktra == 0)
            {
                printf("%d", j); // Print result
                j += 2;
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
        le += 2;
    }
    return 0;
}