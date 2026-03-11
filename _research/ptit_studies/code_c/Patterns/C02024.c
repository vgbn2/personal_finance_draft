/*
 * Filename: C02024.c
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
    for (int i = 0; i < a; i++)
    {
        for (int j = 0; j < b; j++)
        {
            if (i + j < b)
                printf("%c", i + j + 'A'); // Print result
            else
                printf("%c", 'A' + b - j - 1); // Print result
        }
        printf("\n"); // Print result
    }
    return 0;
}