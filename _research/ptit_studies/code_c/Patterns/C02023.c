/*
 * Filename: C02023.c
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
    char c;
    if (a >= b)
        c = 96 + a;
    else
        c = 96 + b;
    for (int i = 0; i < a; i++)
    {
        for (int j = 0; j <= i && j < b; j++)
            printf("%c", c - j); // Print result
        for (int j = i + 1; j < b; j++)
            printf("%c", c - i); // Print result
        printf("\n"); // Print result
    }
    return 0;
}