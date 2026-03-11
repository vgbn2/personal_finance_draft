/*
 * Filename: C01027.c
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
        int a, b;
        scanf("%d %d", &a, &b); // Read input
        while (b > 0)
        {
            int x = a % b;
            a = b;
            b = x;
        }
        printf("%d\n", a); // Print result
    }
    return 0;
}