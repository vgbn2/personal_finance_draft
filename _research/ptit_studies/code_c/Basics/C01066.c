/*
 * Filename: C01066.c
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
    int a, b, c;
    scanf("%d %d %d", &a, &b, &c); // Read input
    int min = a;
    if (b < min)
        min = b;
    if (c < min)
        min = c;
    printf("%d", min); // Print result
    return 0;
}