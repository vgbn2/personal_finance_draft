/*
 * Filename: C02010.c
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
    scanf("%d%d", &a, &b); // Read input
    for (int i = 1; i <= a; i++)
    {
        printf("%d", i); // Print result
        int j = i + 1;
        while (j <= b)
        {
            printf("%d", j); // Print result
            j++;
        }
        if (i < b)
        {
            int j = i - 1;
            while (j > 0)
            {
                printf("%d", j); // Print result
                j--;
            }
        }
        else
        {
            int j = b - 1;
            while (j > 0)
            {
                printf("%d", j); // Print result
                j--;
            }
        }
        printf("\n"); // Print result
    }
}