/*
 * Filename: C06002.c
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
#include <ctype.h>
#include <string.h>

// Entry point
int main()
{
    char s[101];
    gets(s);
    for (int i = 0; i < strlen(s); i++)
        s[i] = toupper(s[i]);
    puts(s);
    return 0;
}