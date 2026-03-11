/*
 * Filename: C02026.c
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
    int s = 65 + (a - 1);
    for (int i = a; i >= 1; i--)
    {
        int d = s;
        if (d > 65 + (b - 1))
        {
            d = 65 + (b - 1);
        }
        for (int j = 1; j <= b; j++)
        {
            if (d == 65 + (b - 1))
            {
                printf("%c", d); // Print result
            }
            else
            {
                printf("%c", d); // Print result
                d++;
            }
        }
        s--;
        printf("\n"); // Print result
    }
    return 0;
}