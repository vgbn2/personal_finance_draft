/*
 * Filename: C01012.c
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
    int T;
    scanf("%d\n", &T); // Read input
    while (T--)
    {
        char x;
        scanf("\n%c", &x); // Read input
        if (x >= 'A' && x <= 'Z')
            printf("%c\n", x + 32); // Print result
        else if (x >= 'a' && x <= 'z')
            printf("%c\n", x - 32); // Print result
    }
    return 0;
}