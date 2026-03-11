/*
 * Filename: C02001.c
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
        for (int j = 1; j <= n; j++)
            printf("*"); // Print result
        printf("\n"); // Print result
    }
    return 0;
}