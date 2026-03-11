/*
 * Filename: C03041.c
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
    int t;
    scanf("%d", &t); // Read input
    while (t--)
    {
        int a, b, c, d;
        scanf("%d %d %d %d", &a, &b, &c, &d); // Read input
        if (c - a == d - b)
            printf("YES\n"); // Print result
        else
            printf("NO\n"); // Print result
    }
    return 0;
}