/*
 * Filename: C02030.c
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
    int tang1 = -1;
    for (int i = 1; i <= n; i++)
    {
        int KhoiDau = 66;
        int Ktra = 0;
        int tang = tang1;
        for (int j = 1; j <= cot; j++)
        {
            if (j == 1)
            {
                printf("@"); // Print result
                continue;
            }
            if (j == cot && j != 1)
            {
                printf("@"); // Print result
                continue;
            }
            if (j >= 2 && j < cot)
            {
                if (tang > 0)
                {
                    printf("%c", KhoiDau); // Print result
                    KhoiDau += 2;
                    tang--;
                }
                else
                {
                    printf("%c", KhoiDau); // Print result
                    KhoiDau -= 2;
                    tang--;
                }
            }
        }
        cot += 2;
        tang1++;
        printf("\n"); // Print result
    }
    return 0;
}