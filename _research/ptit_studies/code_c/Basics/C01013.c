/*
 * Filename: C01013.c
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
    char d, e;
    scanf("%d %c %d %c %d", &a, &d, &b, &e, &c); // Read input
    if (a + b == c)
        printf("YES"); // Print result
    else
        printf("NO"); // Print result
    return 0;
}