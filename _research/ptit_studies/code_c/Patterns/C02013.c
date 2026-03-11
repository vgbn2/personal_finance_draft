/*
 * Filename: C02013.c
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
    int gtri = b;
    if (gtri < a)
        gtri = a;
    for (int i = 1; i <= a; i++)
    {
        int j = gtri;
        int ktra = 0, dem = 0;
        while (dem < b)
        {
            if (j == 1)
            {
                ktra = 1;
                dem++;
                printf("%d", j); // Print result
                j++;
                continue;
            }
            if (ktra == 0)
            {
                printf("%d", j); // Print result
                j--;
                dem++;
                continue;
            }
            if (ktra == 1)
            {
                printf("%d", j); // Print result
                j++;
                dem++;
                continue;
            }
        }
        printf("\n"); // Print result
        gtri--;
    }
    return 0;
}