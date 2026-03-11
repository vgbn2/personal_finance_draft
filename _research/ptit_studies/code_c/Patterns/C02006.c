/*
 * Filename: C02006.c
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
        for (int j = b + i - 2; j >= b; j--)
            printf("~"); // Print result
        for (int j = 1; j <= b; j++)
        {
            if (i == 1 || i == a)
                printf("*"); // Print result
            else
            {
                if (j == 1 || j == b)
                    printf("*"); // Print result
                else
                    printf("."); // Print result
            }
        }
        printf("\n"); // Print result
    }
    return 0;
}