/*
 * Filename: C02016.c
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
    for (int i = 1; i <= n; i++)
    {
        if (i % 2 == 1)
        {
            for (int j = 1; j <= 2 * i - 1; j += 2)
                printf("%d", j); // Print result
        }
        else
        {
            for (int j = 2; j <= 2 * i; j += 2)
                printf("%d", j); // Print result
        }
        printf("\n"); // Print result
    }
    return 0;
}